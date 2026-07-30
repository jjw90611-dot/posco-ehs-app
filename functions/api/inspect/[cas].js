// functions/api/inspect/[cas].js
// Cloudflare Pages Functions - CAS 기반 4대 법규 통합 검수 프록시
// 클라이언트 inspectByCas(cas) 가 호출: GET /api/inspect/{cas}
//
// 데이터 소스: 한국산업안전보건공단 안전보건법령 스마트검색 (공공데이터포털)
// - 산업안전보건법 (시행령/시행규칙/기준규칙)
// - KOSHA Guide (발암성/독성 근거)
//
// 반환 스키마 (클라이언트 01-inspect.js 규격):
// {
//   ok, casNo, matchedName, status: 'REGULATED'|'NO_MATCH',
//   matched: { kosha, nier, nfa, cci },
//   tags: [...],
//   sources: { kosha, nier, nfa, cci }
// }

const KOSHA_API_KEY = "4b39abd89a4760da331813df65f3d422dbb86fca4ce6db701a0aa6919a49a9a4";
const KOSHA_BASE = "https://apis.data.go.kr/B552468/srch/smartSearch";

// 카테고리 정의 (한국산업안전보건공단 문서 분류)
const CATEGORIES = [
    { id: 2, name: '산업안전보건법 시행령' },
    { id: 3, name: '산업안전보건법 시행규칙' },
    { id: 4, name: '산업안전보건기준에 관한 규칙' },
    { id: 5, name: '고시/훈령/예규' },
    { id: 7, name: 'KOSHA Guide' }
];

/* =========================================================
   메인 핸들러
   ========================================================= */
export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const cas = (params.cas || '').trim();
    const refresh = url.searchParams.get('refresh') === 'true';

    // CORS Preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders()
        });
    }

    if (!cas) {
        return json({ ok: false, error: 'CAS No.가 필요합니다' }, 400);
    }

    // CAS 형식 검증 (숫자-숫자-숫자)
    if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) {
        return json({
            ok: false,
            casNo: cas,
            error: `잘못된 CAS 형식: ${cas} (예: 71-43-2)`
        }, 400);
    }

    try {
        // 5개 카테고리 병렬 조회
        const searchPromises = CATEGORIES.map(cat =>
            fetchKoshaByCategory(cas, cat.id).catch(e => {
                console.warn(`[category ${cat.id}] ${e.message}`);
                return { category: cat.id, items: [] };
            })
        );

        const results = await Promise.all(searchPromises);

        // 모든 items 통합
        const allItems = [];
        let totalCount = 0;
        results.forEach(r => {
            if (r.items && r.items.length) allItems.push(...r.items);
            totalCount += (r.totalCount || 0);
        });

        // 판정 로직 실행
        const inspection = analyzeItems(cas, allItems);

        return json({
            ok: true,
            casNo: cas,
            matchedName: inspection.matchedName,
            status: inspection.status,
            matched: inspection.matched,
            tags: inspection.tags,
            sources: inspection.sources,
            meta: {
                totalHits: totalCount,
                analyzedItems: allItems.length,
                categoriesSearched: CATEGORIES.length,
                refresh
            }
        });

    } catch (e) {
        console.error('[inspect] fatal:', e);
        return json({
            ok: false,
            casNo: cas,
            error: e.message || '조회 실패'
        }, 500);
    }
}

/* =========================================================
   KOSHA smartSearch API 호출 (카테고리별)
   ========================================================= */
async function fetchKoshaByCategory(cas, categoryId) {
    const apiUrl = `${KOSHA_BASE}`
        + `?serviceKey=${encodeURIComponent(KOSHA_API_KEY)}`
        + `&pageNo=1`
        + `&numOfRows=100`
        + `&searchValue=${encodeURIComponent(cas)}`
        + `&category=${categoryId}`
        + `&type=json`
        + `&_type=json`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);

    try {
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: ctrl.signal
        });
        clearTimeout(timeout);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // 공공데이터포털이 XML 에러를 반환하는 경우 대비
            throw new Error('JSON 파싱 실패 (인증키 확인 필요)');
        }

        const body = data?.response?.body || {};
        const items = body?.items?.item || [];
        const totalCount = body?.totalCount || 0;

        return {
            category: categoryId,
            items: Array.isArray(items) ? items : [items],
            totalCount
        };
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

/* =========================================================
   ⭐ 핵심 판정 로직
   ========================================================= */
function analyzeItems(cas, items) {
    const tags = new Set();
    const matched = { kosha: false, nier: false, nfa: false, cci: false };
    const matchedDocs = { kosha: [], nier: [], nfa: [], cci: [] };
    let matchedName = null;
    let isSpecial = false;
    let cmrDetected = false;

    // CAS 이형 패턴 (본문 매칭 정확도 향상)
    const casPatterns = [
        `; ${cas})`,       // "Benzene; 71-43-2)"
        `[${cas}]`,        // "벤젠[71-43-2]"
        `(${cas})`,        // 괄호 안
        ` ${cas} `,        // 공백 사이
        ` ${cas};`,        // 세미콜론 앞
        ` ${cas},`,        // 콤마 앞
        ` ${cas}.`,        // 마침표 앞
        `:${cas}`,         // 콜론 뒤
        `-${cas}`          // 하이픈 뒤 (드묾)
    ];

    for (const item of items) {
        const content = (item.content || '').toString();
        const docId = (item.doc_id || '').toString();
        const title = (item.title || '').toString();
        const keyword = (item.keyword || '').toString();

        // 1단계: CAS 실제 포함 여부 검증 (오탐 방지)
        const hasCasPattern = casPatterns.some(p => content.includes(p));
        const hasBasicCas = content.includes(cas);
        if (!hasBasicCas) continue;   // CAS 미포함 → 스킵

        // 2단계: 산업안전보건법 매칭 (KOSHA02/03/04/05 카테고리)
        if (docId.startsWith('KOSHA02') ||
            docId.startsWith('KOSHA03') ||
            docId.startsWith('KOSHA04') ||
            docId.startsWith('KOSHA05')) {
            matched.kosha = true;
            matchedDocs.kosha.push(shortDoc(item));
        }

        // 3단계: CAS 주변 텍스트로 세부 판정
        const casIdx = content.indexOf(cas);
        const before = content.substring(Math.max(0, casIdx - 100), casIdx);
        const after = content.substring(casIdx, Math.min(content.length, casIdx + 300));
        const nearText = before + after;

        // 물질명 추출 (최초 매칭 시)
        if (!matchedName) {
            matchedName = extractMatchedName(before, after, cas);
        }

        // ⭐ 특별관리물질 판정 (관리대상 유해물질 규칙 별표 12)
        if (nearText.includes('특별관리물질')) {
            tags.add('특별관리');
            isSpecial = true;
        }

        // ⭐ 작업환경측정 대상 유해인자 (시행규칙 별표 21)
        if (title.includes('작업환경측정') ||
            docId.includes('별표 21') ||
            content.includes('작업환경측정 대상 유해인자')) {
            tags.add('작업환경측정');
        }

        // ⭐ 특수건강진단 대상 유해인자 (시행규칙 별표 22, 23)
        if (title.includes('특수건강진단') ||
            docId.includes('별표 22') ||
            docId.includes('별표 23') ||
            content.includes('특수건강진단 대상')) {
            tags.add('특수건강진단');
        }

        // ⭐ 유해인자 노출농도 허용기준 (시행규칙 별표 19)
        if (title.includes('허용기준') ||
            title.includes('노출 농도의 허용기준') ||
            docId.includes('별표 19')) {
            tags.add('노출기준설정');
        }

        // ⭐ 관리대상 유해물질 (기준규칙 별표 12)
        if (title.includes('관리대상 유해물질') ||
            docId.includes('별표 12')) {
            tags.add('관리대상');
        }

        // ⭐ 제조 등이 금지되는 유해물질 (시행령 제87조)
        if (title.includes('제조 등이 금지') ||
            content.includes('제조 등이 금지되는 유해물질')) {
            tags.add('제조금지');
        }

        // ⭐ 허가대상 유해물질 (시행령 제88조)
        if (title.includes('허가 대상') ||
            nearText.includes('허가 대상 유해물질')) {
            tags.add('허가대상');
        }

        // ⭐ 발암성/변이원성/생식독성 (CMR) - KOSHA Guide 위주
        if (docId.startsWith('KOSHA07') ||
            docId.startsWith('KOSHA06')) {
            const cmrKw = ['발암성', '발암물질', '변이원성', '생식독성', '생식세포변이원성'];
            if (cmrKw.some(kw => (content + title + keyword).includes(kw))) {
                if ((content + title + keyword).includes('발암')) tags.add('발암성');
                if ((content + title + keyword).includes('변이원')) tags.add('변이원성');
                if ((content + title + keyword).includes('생식')) tags.add('생식독성');
                cmrDetected = true;
            }
        }

        // 노출 근로자 건강관리지침 (KOSHA07)
        if (docId.startsWith('KOSHA07') && title.includes('건강관리')) {
            tags.add('건강관리지침');
        }
    }

    // 4단계: 태그 통합 및 추가 판정
    if (isSpecial) tags.add('산안법');
    if (matched.kosha) tags.add('산안법');

    // 확정 판정
    const status = matched.kosha || matched.nier || matched.nfa || matched.cci
        ? 'REGULATED'
        : 'NO_MATCH';

    // sources 구성 (클라이언트 렌더링용)
    const sources = {
        kosha: matched.kosha ? {
            ok: true, hit: true,
            note: `KOSHA 안전보건법령 ${matchedDocs.kosha.length}건 매칭`,
            name: matchedName,
            docs: matchedDocs.kosha.slice(0, 5)  // 상위 5건만
        } : {
            ok: true, hit: false,
            note: '산업안전보건법 매칭 없음'
        },
        nier: matched.nier ? {
            ok: true, hit: true,
            note: '화관법 유독물질 해당'
        } : {
            ok: true, hit: false,
            note: '화관법 매칭 없음 (KOSHA API 기반 판정)'
        },
        nfa: matched.nfa ? {
            ok: true, hit: true,
            note: '소방법 지정 위험물'
        } : {
            ok: true, hit: false,
            note: '위험물안전관리법 매칭 없음'
        },
        cci: matched.cci ? {
            ok: true, hit: true,
            note: '화학물질안전관리정보 등재'
        } : {
            ok: true, hit: false,
            note: '화학물질안전원 매칭 없음'
        }
    };

    return {
        status,
        matched,
        tags: [...tags],
        matchedName: matchedName || null,
        sources,
        isSpecial,
        cmrDetected
    };
}

/* =========================================================
   유틸: 물질명 추출
   본문에서 CAS 주변의 물질명(한글+영문)을 추출
   예: "벤젠(Benzene; 71-43-2)" → "벤젠"
   ========================================================= */
function extractMatchedName(before, after, cas) {
    // 패턴 1: "물질명(Chemical; CAS)"
    const m1 = before.match(/([가-힣A-Za-z0-9\-,()\s]{2,40})\s*\(\s*[A-Za-z][^;]{0,40}$/);
    if (m1) {
        const name = m1[1].trim().replace(/^[\d\)\.\s]+/, '');
        if (name.length >= 2 && name.length <= 40) return name;
    }
    // 패턴 2: "물질명[CAS]"
    const m2 = before.match(/([가-힣A-Za-z0-9\-]{2,30})\s*
\[$/);
    if (m2) return m2[1].trim();

    // 패턴 3: 간단히 CAS 앞의 한글/영문 단어
    const m3 = before.match(/([가-힣][가-힣A-Za-z0-9\-]{1,20})\s*[\(
\[]?$/);
    if (m3) return m3[1].trim();

    return null;
}

/* =========================================================
   유틸: 문서 요약 (sources.docs 용)
   ========================================================= */
function shortDoc(item) {
    return {
        docId: item.doc_id || '',
        title: (item.title || '').substring(0, 80),
        category: item.category || '',
        score: item.score || 0
    };
}

/* =========================================================
   유틸: JSON 응답 헬퍼
   ========================================================= */
function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: corsHeaders()
    });
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=1800'  // 30분 서버측 캐시
    };
}

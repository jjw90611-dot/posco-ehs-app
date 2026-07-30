// functions/api/inspect/[cas].js
// Cloudflare Pages Functions - CAS 기반 4대 법규 통합 검수 프록시
// v2: 개별 타임아웃 + 부분 실패 허용 + 상세 진단 로그

const KOSHA_API_KEY = "4b39abd89a4760da331813df65f3d422dbb86fca4ce6db701a0aa6919a49a9a4";
const KOSHA_BASE = "https://apis.data.go.kr/B552468/srch/smartSearch";

// ⭐ 카테고리 축소: 5개 → 핵심 3개 (속도 우선)
const CATEGORIES = [
    { id: 2, name: '산업안전보건법 시행령' },
    { id: 4, name: '산업안전보건기준에 관한 규칙' },
    { id: 7, name: 'KOSHA Guide' }
];

const PER_CALL_TIMEOUT = 5000;   // 카테고리별 5초
const NUM_OF_ROWS = 50;          // 100 → 50 축소 (응답 크기 줄이기)

/* =========================================================
   메인 핸들러
   ========================================================= */
export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const cas = (params.cas || '').trim();
    const refresh = url.searchParams.get('refresh') === 'true';
    const debug = url.searchParams.get('debug') === 'true';

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!cas) {
        return json({ ok: false, error: 'CAS No.가 필요합니다' }, 400);
    }

    if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) {
        return json({
            ok: false, casNo: cas,
            error: `잘못된 CAS 형식: ${cas} (예: 71-43-2)`
        }, 400);
    }

    const diagnostics = [];
    const startTs = Date.now();

    try {
        // 병렬 조회 (각 요청 개별 타임아웃)
        const searchPromises = CATEGORIES.map(cat =>
            fetchKoshaByCategory(cas, cat.id, diagnostics)
                .catch(e => {
                    diagnostics.push({
                        category: cat.id, name: cat.name,
                        ok: false, error: e.message
                    });
                    return { category: cat.id, items: [], totalCount: 0 };
                })
        );

        const results = await Promise.all(searchPromises);

        const allItems = [];
        let totalCount = 0;
        results.forEach(r => {
            if (r.items && r.items.length) allItems.push(...r.items);
            totalCount += (r.totalCount || 0);
        });

        const inspection = analyzeItems(cas, allItems);
        const elapsedMs = Date.now() - startTs;

        const response = {
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
                elapsedMs,
                refresh
            }
        };

        // debug 모드: 진단 정보 포함
        if (debug) {
            response.diagnostics = diagnostics;
        }

        return json(response);

    } catch (e) {
        console.error('[inspect] fatal:', e);
        return json({
            ok: false, casNo: cas,
            error: e.message || '조회 실패',
            diagnostics: debug ? diagnostics : undefined
        }, 500);
    }
}

/* =========================================================
   KOSHA smartSearch API 호출
   ========================================================= */
async function fetchKoshaByCategory(cas, categoryId, diagnostics) {
    const apiUrl = `${KOSHA_BASE}`
        + `?serviceKey=${encodeURIComponent(KOSHA_API_KEY)}`
        + `&pageNo=1`
        + `&numOfRows=${NUM_OF_ROWS}`
        + `&searchValue=${encodeURIComponent(cas)}`
        + `&category=${categoryId}`
        + `&type=json`
        + `&_type=json`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT);
    const startTs = Date.now();

    try {
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: ctrl.signal
        });
        clearTimeout(timeout);

        const elapsedMs = Date.now() - startTs;

        if (!res.ok) {
            diagnostics.push({
                category: categoryId, ok: false,
                httpStatus: res.status, elapsedMs
            });
            throw new Error(`HTTP ${res.status}`);
        }

        const text = await res.text();

        // ⭐ 응답이 XML(에러)인 경우 감지
        if (text.trim().startsWith('<')) {
            diagnostics.push({
                category: categoryId, ok: false,
                error: 'XML 응답 (API키 문제 가능성)',
                sample: text.substring(0, 200),
                elapsedMs
            });
            throw new Error('KOSHA API가 XML 에러를 반환 (API키 확인 필요)');
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            diagnostics.push({
                category: categoryId, ok: false,
                error: 'JSON 파싱 실패', sample: text.substring(0, 200),
                elapsedMs
            });
            throw new Error('JSON 파싱 실패');
        }

        const body = data?.response?.body || data?.body || {};
        let items = body?.items?.item || body?.items || [];
        if (!Array.isArray(items)) items = items ? [items] : [];
        const totalCount = Number(body?.totalCount || 0);

        diagnostics.push({
            category: categoryId, ok: true,
            totalCount, itemsReturned: items.length, elapsedMs
        });

        return { category: categoryId, items, totalCount };

    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            throw new Error(`타임아웃 ${PER_CALL_TIMEOUT}ms 초과`);
        }
        throw e;
    }
}

/* =========================================================
   판정 로직
   ========================================================= */
function analyzeItems(cas, items) {
    const tags = new Set();
    const matched = { kosha: false, nier: false, nfa: false, cci: false };
    const matchedDocs = { kosha: [], nier: [], nfa: [], cci: [] };
    let matchedName = null;
    let isSpecial = false;

    for (const item of items) {
        const content = (item.content || '').toString();
        const docId = (item.doc_id || '').toString();
        const title = (item.title || '').toString();
        const keyword = (item.keyword || '').toString();

        const hasBasicCas = content.includes(cas) || title.includes(cas) || keyword.includes(cas);
        if (!hasBasicCas) continue;

        if (docId.startsWith('KOSHA02') || docId.startsWith('KOSHA03') ||
            docId.startsWith('KOSHA04') || docId.startsWith('KOSHA05')) {
            matched.kosha = true;
            matchedDocs.kosha.push(shortDoc(item));
        }

        const casIdx = content.indexOf(cas);
        let before = '', after = '', nearText = '';
        if (casIdx >= 0) {
            before = content.substring(Math.max(0, casIdx - 100), casIdx);
            after = content.substring(casIdx, Math.min(content.length, casIdx + 300));
            nearText = before + after;
        } else {
            nearText = content;
        }

        if (!matchedName) {
            matchedName = extractMatchedName(before, after, cas) || extractNameFromTitle(title);
        }

        if (nearText.includes('특별관리물질')) {
            tags.add('특별관리');
            isSpecial = true;
        }

        if (title.includes('작업환경측정') || docId.includes('별표 21') ||
            content.includes('작업환경측정 대상 유해인자')) {
            tags.add('작업환경측정');
        }

        if (title.includes('특수건강진단') || docId.includes('별표 22') ||
            docId.includes('별표 23') || content.includes('특수건강진단 대상')) {
            tags.add('특수건강진단');
        }

        if (title.includes('허용기준') || docId.includes('별표 19')) {
            tags.add('노출기준설정');
        }

        if (title.includes('관리대상 유해물질') || docId.includes('별표 12')) {
            tags.add('관리대상');
        }

        if (title.includes('제조 등이 금지') ||
            content.includes('제조 등이 금지되는 유해물질')) {
            tags.add('제조금지');
        }

        if (title.includes('허가 대상') || nearText.includes('허가 대상 유해물질')) {
            tags.add('허가대상');
        }

        if (docId.startsWith('KOSHA07') || docId.startsWith('KOSHA06')) {
            const merged = content + title + keyword;
            if (merged.includes('발암')) tags.add('발암성');
            if (merged.includes('변이원')) tags.add('변이원성');
            if (merged.includes('생식')) tags.add('생식독성');
        }

        if (docId.startsWith('KOSHA07') && title.includes('건강관리')) {
            tags.add('건강관리지침');
        }
    }

    if (isSpecial) tags.add('산안법');
    if (matched.kosha) tags.add('산안법');

    const anyMatched = matched.kosha || matched.nier || matched.nfa || matched.cci;
    const status = anyMatched ? 'REGULATED' : 'NO_MATCH';

    const sources = {
        kosha: matched.kosha ? {
            ok: true, hit: true,
            note: `KOSHA 안전보건법령 ${matchedDocs.kosha.length}건 매칭`,
            name: matchedName,
            docs: matchedDocs.kosha.slice(0, 5)
        } : { ok: true, hit: false, note: '산업안전보건법 매칭 없음' },
        nier: matched.nier ? { ok: true, hit: true, note: '화관법 유독물질 해당' }
                            : { ok: true, hit: false, note: '화관법 매칭 없음' },
        nfa: matched.nfa ? { ok: true, hit: true, note: '소방법 지정 위험물' }
                          : { ok: true, hit: false, note: '위험물안전관리법 매칭 없음' },
        cci: matched.cci ? { ok: true, hit: true, note: '화학물질안전관리정보 등재' }
                          : { ok: true, hit: false, note: '화학물질안전원 매칭 없음' }
    };

    return { status, matched, tags: [...tags], matchedName: matchedName || null, sources };
}

function extractMatchedName(before, after, cas) {
    if (!before) return null;

    const m1 = before.match(/([가-힣A-Za-z0-9\-,()\s]{2,40})\s*\(\s*[A-Za-z][^;]{0,40}$/);
    if (m1) {
        const name = m1[1].trim().replace(/^[\d\)\.\s]+/, '');
        if (name.length >= 2 && name.length <= 40) return name;
    }

    const m2 = before.match(/([가-힣A-Za-z0-9\-]{2,30})\s*
\[$/);
    if (m2) return m2[1].trim();

    const m3 = before.match(/([가-힣][가-힣A-Za-z0-9\-]{1,20})\s*[\(
\[]?$/);
    if (m3) return m3[1].trim();

    return null;
}

function extractNameFromTitle(title) {
    if (!title) return null;
    const m = title.match(/^([가-힣A-Za-z][가-힣A-Za-z0-9\-\s]{1,30})[\(
\[]/);
    if (m) return m[1].trim();
    return null;
}

function shortDoc(item) {
    return {
        docId: item.doc_id || '',
        title: (item.title || '').substring(0, 80),
        category: item.category || '',
        score: item.score || 0
    };
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=1800'
    };
}

/* =========================================================
   PDF 텍스트 추출
   ========================================================= */
async function extractPdfText(file){
    try{
        if(!window.pdfjsLib) return '';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
        let text = '';
        const maxPages = Math.min(pdf.numPages, 8);
        for(let i=1; i<=maxPages; i++){
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it=>it.str).join(' ') + '\n';
        }
        return text;
    }catch(e){
        console.warn('PDF 파싱 실패:', e);
        return '';
    }
}

/* =========================================================
   [핵심] 정확도 우선 매칭 로직
   ========================================================= */
async function parseMSDSFile(file){
    const fileName = file.name;
    const fileNameLower = fileName.toLowerCase();

    let pdfText = '';
    if(file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')){
        pdfText = await extractPdfText(file);
    }
    const pdfTextLower = pdfText.toLowerCase();

    const casPattern = /\b(\d{2,7}-\d{2}-\d)\b/g;
    const casMatches = [...pdfText.matchAll(casPattern)].map(m=>m[1]);
    const casInFilename = fileName.match(casPattern) || [];
    const allCas = [...new Set([...casInFilename, ...casMatches])];

    const scored = MSDS_KNOWLEDGE_BASE.map(kb=>{
        let score = 0;
        let reasons = [];

        const topCas = allCas.slice(0, 5);
        for(const cas of kb.casNumbers){
            if(topCas.includes(cas)){
                score += 100;
                reasons.push(`CAS ${cas} 정확매칭`);
                break;
            }
        }

        const pdfHead = pdfTextLower.substring(0, 500);
        for(const kw of kb.strongKeywords){
            const kwLower = kw.toLowerCase();
            if(fileNameLower.includes(kwLower)){
                score += 50;
                reasons.push(`파일명 "${kw}"`);
            }
            if(pdfHead.includes(kwLower)){
                score += 30;
                reasons.push(`PDF 상단 "${kw}"`);
            } else if(pdfTextLower.includes(kwLower)){
                score += 10;
                reasons.push(`PDF 본문 "${kw}"`);
            }
        }

        for(const kw of (kb.weakKeywords||[])){
            if(pdfTextLower.includes(kw.toLowerCase())){
                score += 3;
            }
        }

        return { kb, score, reasons };
    });

    scored.sort((a,b)=>b.score - a.score);
    const best = scored[0];
    const second = scored[1];

    console.log('[MSDS 매칭 점수]', scored.map(s=>`${s.kb.id}:${s.score}`).join(' / '));

    let matched = null;
    let confidence = '낮음 (원본 확인 필요)';
    let matchReason = '';

    if(best && best.score >= 30){
        matched = best.kb.template;
        matchReason = best.reasons.join(', ');
        const gap = best.score - (second?.score || 0);
        const hasCasMatch = best.reasons.some(r=>r.includes('CAS'));

        if(hasCasMatch && best.score >= 100){
            confidence = '매우 높음 (CAS 정확매칭)';
        } else if(best.score >= 80 || gap >= 30){
            confidence = '높음 (지식베이스 매칭)';
        } else if(gap < 20){
            confidence = `애매 (${best.kb.id} vs ${second?.kb.id} - 원본 확인 권장)`;
            matched = null;
        } else {
            confidence = '보통 (키워드 매칭)';
        }
    }

    const base = matched
        ? JSON.parse(JSON.stringify(matched))
        : JSON.parse(JSON.stringify(FALLBACK_TEMPLATE));
    base.id = 'MSDS_'+Date.now()+'_'+Math.floor(Math.random()*1000);

    const fnameMatch = fileName.match(/\(([^)]+)\)/);
    if(fnameMatch && !matched){
        base.name = fnameMatch[1];
    }

    if(!matched && allCas.length > 0){
        base.cas = allCas[0];
        base.subtitle = allCas[0];
    }

    base.sourceFile = fileName;
    base.uploadedAt = new Date().toISOString();
    base.matchConfidence = confidence;
    base.matchReason = matchReason || '매칭 실패';
    base.matched = !!matched;
    base.extractedCasList = allCas.slice(0, 5);

    // MSDS 3번 항목 자동 추출
    const composition = extractComposition(pdfText);

    const kbHasComposition = matched && best.kb.template.composition && best.kb.template.composition.length > 0;
    const pdfParseFailed = !composition.valid || composition.items.length === 0 || composition.sum === 0;

    if(kbHasComposition && pdfParseFailed && best.score >= 80){
        base.composition = JSON.parse(JSON.stringify(best.kb.template.composition));
        base.compositionSum = base.composition.reduce((s,c)=>s+(c.contentNum||0), 0);
        base.compositionValid = true;
        base.compositionWarnings = ['ℹ️ PDF 텍스트 추출 실패 → AI 지식베이스 표준 성분으로 자동 대체됨 (검수 후 등록 권장)'];
        base.compositionRawText = composition.rawText || '(PDF 3번 항목 추출 실패)';
    } else {
        base.composition = composition.items;
        base.compositionSum = composition.sum;
        base.compositionValid = composition.valid;
        base.compositionWarnings = composition.warnings;
        base.compositionRawText = composition.rawText;
    }
    base.compositionReviewed = false;

    return base;
}

/* =========================================================
   MSDS 3번 구성성분 파서 (v4: 근접거리 기반)
   ========================================================= */
function extractComposition(pdfText){
    const result = {
        items: [], sum: 0, valid: false, warnings: [], rawText: ''
    };

    if(!pdfText || pdfText.length < 100){
        result.warnings.push('PDF 텍스트 추출 실패 - 수동 입력 필요');
        return result;
    }

    const startMatch = pdfText.match(/3\s*[\.\)]?\s*구성성분/);
    if(!startMatch){
        result.warnings.push('3번 "구성성분의 명칭 및 함유량" 항목을 찾지 못했습니다');
        return result;
    }
    const startIdx = startMatch.index;

    const endCandidates = [
        /4\s*[\.\)]\s*응급/,
        /4\s*[\.\)]\s*폭발/,
        /4\s*[\.\)]\s*화재/,
        /4\s*[\.\)]\s*누출/,
        /4\s*[\.\)]\s*[가-힣]/,
    ];
    let endIdx = pdfText.length;
    for(const re of endCandidates){
        const m = pdfText.substring(startIdx + 10).match(re);
        if(m){
            const abs = startIdx + 10 + m.index;
            if(abs < endIdx) endIdx = abs;
        }
    }
    if(endIdx - startIdx > 2000){ endIdx = startIdx + 2000; }

    let section3 = pdfText.substring(startIdx, endIdx);
    result.rawText = section3.substring(0, 3000);

    const casPattern = /(\d{2,7}-\d{2}-\d)(\s*[\/,]?\s*KE-\d+)?/g;
    const casHits = [...section3.matchAll(casPattern)];

    if(casHits.length === 0){
        result.warnings.push('CAS 번호를 찾지 못했습니다 - 수동 입력 필요');
        return result;
    }

    const HEADER_TOKENS = new Set([
        '구성성분','명칭','함유량','화학물질명','관용명','이명','異名',
        '및','또는','번호','식별번호','CAS','No','물질명','성분명',
        '분류','기준','비고','참고','참조','물질','성분'
    ]);
    const VERB_ENDINGS = /(시오|하시오|하세요|합니다|위해|방지|조치|흡수|누출물|주의|경고)$/;

    casHits.forEach((hit, i) => {
        const cas = hit[1];
        const hitStart = hit.index;
        const hitEnd = hit.index + hit[0].length;

        const prevEnd = i === 0 ? Math.max(0, hitStart - 60)
                                : (casHits[i-1].index + casHits[i-1][0].length);
        let nameArea = section3.substring(Math.max(prevEnd, hitStart - 60), hitStart);

        nameArea = nameArea
            .replace(/구성성분[의]?\s*명칭\s*및?\s*함유량/g, ' ')
            .replace(/화학물질명/g, ' ')
            .replace(/관용명[\s및]*이명/g, ' ')
            .replace(/[\(
\[][異異]?名[\)\]
]/g, ' ')
            .replace(/CAS\s*번호[\s또는]*식별번호/gi, ' ')
            .replace(/함유량\s*\(?%?\)?/g, ' ')
            .replace(/[,\.\/\(\)
\[\]
|]/g, ' ')
            .replace(/\d+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = nameArea.split(' ')
            .map(t => t.trim())
            .filter(t => t.length >= 1)
            .filter(t => !HEADER_TOKENS.has(t))
            .filter(t => !VERB_ENDINGS.test(t))
            .filter(t => t.length <= 40);

        let name = '(추출실패)';
        if(tokens.length > 0){
            name = tokens[0];
            if(name.length === 1 && tokens.length > 1 && !/[가-힣]/.test(name)){
                name = tokens[1];
            }
        }

        const nextHitStart = casHits[i+1] ? casHits[i+1].index : section3.length;
        const contentAreaEnd = Math.min(hitEnd + 30, nextHitStart);
        let contentArea = section3.substring(hitEnd, contentAreaEnd);

        contentArea = contentArea.replace(/KE-\d+/gi, ' ');
        contentArea = contentArea.replace(/[A-Z]{2,3}-\d+/g, ' ');

        let content = '-';
        let contentNum = 0;

        const patterns = [
            { re: /([<>≥≤]?\s*\d{1,3}(?:\.\d+)?)\s*[~\-\∼–]\s*(\d{1,3}(?:\.\d+)?)\s*%/, range: true },
            { re: /([<>≥≤]?\s*\d{1,3}(?:\.\d+)?)\s*[~\-\∼–]\s*(\d{1,3}(?:\.\d+)?)(?!\d)/, range: true },
            { re: /([<>≥≤]?\s*\d{1,3}(?:\.\d+)?)\s*%/, range: false },
            { re: /(?:^|\s)([<>≥≤]?\s*\d{1,3}(?:\.\d+)?)(?!\d)/, range: false },
        ];

        for(const p of patterns){
            const m = contentArea.match(p.re);
            if(!m) continue;

            if(p.range){
                const lo = parseFloat(m[1].replace(/[<>≥≤\s]/g, ''));
                const hi = parseFloat(m[2]);
                if(lo >= 0 && lo <= 100 && hi >= 0 && hi <= 100 && lo <= hi){
                    if(lo < 5 && (hi - lo) < 0.1){ continue; }
                    content = `${lo}~${hi}%`;
                    contentNum = (lo + hi) / 2;
                    break;
                }
            } else {
                const val = parseFloat(m[1].replace(/[<>≥≤\s]/g, ''));
                if(val > 0 && val <= 100){
                    content = m[1].replace(/\s/g, '') + '%';
                    contentNum = val;
                    break;
                }
            }
        }

        if(!result.items.some(it => it.cas === cas)){
            result.items.push({
                name: name, cas: cas, content: content, contentNum: contentNum
            });
        }
    });

    result.sum = Math.round(result.items.reduce((s,it)=>s + it.contentNum, 0) * 10) / 10;

    if(result.sum >= 95 && result.sum <= 105){
        result.valid = true;
    } else if(result.sum < 95){
        result.warnings.push(`⚠️ 합계 ${result.sum}% - 누락 성분이 있을 수 있습니다 (100% 미달)`);
    } else {
        result.warnings.push(`⚠️ 합계 ${result.sum}% - 중복 추출 가능성이 있습니다 (100% 초과)`);
    }

    result.items.forEach((it, i)=>{
        if(it.name === '(추출실패)' || it.name === '(미상)'){
            result.warnings.push(`${i+1}번째 성분: 물질명 추출 실패 - 수동 확인 필요`);
        }
        if(!it.content || it.content === '-'){
            result.warnings.push(`${i+1}번째 성분 (CAS ${it.cas}): 함유량 추출 실패`);
        }
    });

    console.log('[extractComposition] 결과:', {
        items: result.items,
        sum: result.sum,
        valid: result.valid,
        rawTextPreview: result.rawText.substring(0, 500)
    });

    return result;
}

/* =========================================================
   구성성분 검수 UI
   ========================================================= */
function renderCompositionReview(parsedMaterial){
    const container = document.getElementById('compositionReviewArea');
    if(!container) return;

    if(!parsedMaterial.composition || parsedMaterial.composition.length === 0){
        container.classList.add('hidden');
        container.innerHTML = '';
        const regBtn = document.getElementById('btnRegister');
        if(regBtn){
            regBtn.disabled = false;
            regBtn.classList.remove('opacity-50','cursor-not-allowed');
        }
        return;
    }

    const comp = parsedMaterial.composition || [];
    const sum = parsedMaterial.compositionSum || 0;
    const valid = parsedMaterial.compositionValid;
    const warnings = parsedMaterial.compositionWarnings || [];

    const sumBadgeColor = valid
        ? 'bg-green-100 text-green-800 border-green-300'
        : (sum < 95 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300');
    const sumIcon = valid ? '✅' : '⚠️';

    let html = `
    <div class="p-4 border-2 ${valid?'border-green-300 bg-green-50':'border-amber-300 bg-amber-50'} rounded-lg">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h4 class="font-bold text-slate-800 text-sm">
                📋 MSDS 3번 「구성성분의 명칭 및 함유량」 자동추출 결과
            </h4>
            <span class="px-3 py-1 text-xs font-bold rounded-full border ${sumBadgeColor}">
                ${sumIcon} 합계 ${sum}%
            </span>
        </div>

        <table class="comp-review-table">
            <thead>
                <tr>
                    <th style="width:40px">#</th>
                    <th>물질명</th>
                    <th style="width:140px">CAS No.</th>
                    <th style="width:110px">함유량(%)</th>
                    <th style="width:50px">삭제</th>
                </tr>
            </thead>
            <tbody id="compReviewTbody">`;

    comp.forEach((item, i)=>{
        const nameErr = item.name.includes('추출실패') || item.name.includes('미상');
        const contErr = !item.content || item.content === '-';
        html += `
            <tr>
                <td style="text-align:center">${i+1}</td>
                <td>
                    <input type="text" value="${item.name.replace(/"/g,'&quot;')}"
                        class="${nameErr?'error':''}"
                        onchange="updateCompItem(${i},'name',this.value)">
                </td>
                <td>
                    <input type="text" value="${item.cas}"
                        style="font-family:monospace;font-size:11px"
                        onchange="updateCompItem(${i},'cas',this.value)">
                </td>
                <td>
                    <input type="text" value="${item.content}"
                        class="${contErr?'error':''}"
                        style="text-align:center"
                        onchange="updateCompItem(${i},'content',this.value)">
                </td>
                <td style="text-align:center">
                    <button onclick="removeCompItem(${i})" style="color:#dc2626;font-weight:bold;cursor:pointer;background:none;border:none;font-size:14px">✕</button>
                </td>
            </tr>`;
    });

    html += `
            </tbody>
        </table>

        <div class="mt-3 flex gap-2 flex-wrap">
            <button onclick="addCompItem()" class="px-3 py-1.5 text-xs bg-slate-600 text-white rounded hover:bg-slate-700 font-semibold">
                ➕ 성분 추가
            </button>
            <button onclick="recalcCompSum()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">
                🔄 합계 재계산
            </button>
            <button onclick="showRawSection3()" class="px-3 py-1.5 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-semibold">
                📄 MSDS 원본 3번 항목 보기
            </button>
        </div>`;

    if(warnings.length > 0){
        html += `
        <div class="mt-3 p-3 bg-white border-l-4 border-amber-500 rounded">
            <div class="text-xs font-bold text-amber-800 mb-1">⚠️ 검토 필요 항목 (${warnings.length}건)</div>
            <ul class="text-[11px] text-amber-900 space-y-0.5 ml-4 list-disc">
                ${warnings.map(w=>`<li>${w}</li>`).join('')}
            </ul>
        </div>`;
    }

    html += `
        <div class="mt-4 p-3 bg-white border-2 border-slate-400 rounded flex items-start gap-3">
            <input type="checkbox" id="compReviewedChk" class="w-5 h-5 mt-0.5"
                ${parsedMaterial.compositionReviewed?'checked':''}
                onchange="toggleCompReviewed(this.checked)">
            <label for="compReviewedChk" class="text-xs font-semibold text-slate-800 cursor-pointer flex-1">
                위 구성성분 정보를 MSDS 원본과 대조하여 <span class="text-red-600 font-bold">검수 완료</span>하였습니다.
                <span class="block text-[11px] text-slate-500 mt-1 font-normal">
                    ※ 검수 완료해야 「AI 자동분석 및 등록」 버튼이 활성화됩니다.
                </span>
            </label>
        </div>
    </div>`;

    container.innerHTML = html;
    container.classList.remove('hidden');

    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = !parsedMaterial.compositionReviewed;
        regBtn.classList.toggle('opacity-50', !parsedMaterial.compositionReviewed);
        regBtn.classList.toggle('cursor-not-allowed', !parsedMaterial.compositionReviewed);
    }
}

function updateCompItem(idx, field, value){
    const m = lastParsedMaterials[0];
    if(!m || !m.composition[idx]) return;
    m.composition[idx][field] = value;
    if(field === 'content'){
        const nums = value.match(/\d+(?:\.\d+)?/g);
        if(nums && nums.length === 2){
            m.composition[idx].contentNum = (parseFloat(nums[0])+parseFloat(nums[1]))/2;
        } else if(nums && nums.length === 1){
            m.composition[idx].contentNum = parseFloat(nums[0]);
        } else {
            m.composition[idx].contentNum = 0;
        }
    }
}

function removeCompItem(idx){
    const m = lastParsedMaterials[0];
    if(!m) return;
    m.composition.splice(idx, 1);
    renderCompositionReview(m);
}

function addCompItem(){
    const m = lastParsedMaterials[0];
    if(!m) return;
    if(!m.composition) m.composition = [];
    m.composition.push({name:'', cas:'', content:'', contentNum:0});
    renderCompositionReview(m);
}

function recalcCompSum(){
    const m = lastParsedMaterials[0];
    if(!m) return;
    m.compositionSum = Math.round(m.composition.reduce((s,it)=>s+(it.contentNum||0),0)*10)/10;
    m.compositionValid = (m.compositionSum >= 95 && m.compositionSum <= 105);
    renderCompositionReview(m);
    showToast(`합계 재계산: ${m.compositionSum}%`);
}

function toggleCompReviewed(checked){
    const m = lastParsedMaterials[0];
    if(m) m.compositionReviewed = checked;
    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = !checked;
        regBtn.classList.toggle('opacity-50', !checked);
        regBtn.classList.toggle('cursor-not-allowed', !checked);
    }
    if(checked) showToast('✅ 검수 완료 - 등록 버튼 활성화');
}

function showRawSection3(){
    const m = lastParsedMaterials[0];
    if(!m || !m.compositionRawText){
        alert('원본 텍스트가 없습니다.');
        return;
    }
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`
        <html><head><title>MSDS 3번 항목 원본</title>
        <meta charset="UTF-8">
        <style>
            body{font-family:'Malgun Gothic',sans-serif;padding:20px;white-space:pre-wrap;line-height:1.7;font-size:13px;color:#333}
            h3{color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:8px}
            .box{background:#f8fafc;border-left:4px solid #0d9488;padding:15px;border-radius:4px;margin-top:10px}
        </style>
        </head><body>
        <h3>📄 MSDS 3번 「구성성분의 명칭 및 함유량」 원본 텍스트</h3>
        <p style="color:#64748b;font-size:11px">📁 원본파일: ${m.sourceFile||''}</p>
        <div class="box">${m.compositionRawText.replace(/</g,'&lt;')}</div>
        </body></html>`);
}

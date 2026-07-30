/* =========================================================
   [진행률 표시·MSDS 파일 처리·등록]
   ========================================================= */
function updateProgress(pct,msg){
    document.getElementById('progressBar').style.width=pct+'%';
    document.getElementById('progressPercent').textContent=Math.round(pct)+'%';
    if(msg){
        const log=document.getElementById('progressLog');
        const p=document.createElement('p');
        p.innerHTML=`<i class="fa-solid fa-check text-emerald-500 mr-1"></i>${msg}`;
        log.appendChild(p);
        log.scrollTop=log.scrollHeight;
    }
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let lastParsedMaterials = [];

async function handleMSDSFiles(files){
    if(!files || files.length===0) return;
    document.getElementById('uploadProgress').classList.remove('hidden');
    document.getElementById('parseResult').classList.add('hidden');
    document.getElementById('compositionReviewArea').classList.add('hidden');
    document.getElementById('progressLog').innerHTML=''; updateProgress(0);

    const parsedList=[];
    for(let i=0;i<files.length;i++){
        const f=files[i], base=(i*100)/files.length;
        updateProgress(base+15/files.length, `📄 [${f.name}] 수신`); await sleep(150);
        updateProgress(base+30/files.length, `🔍 [${f.name}] PDF 텍스트 추출 중…`);
        updateProgress(base+50/files.length, `🧠 [${f.name}] 지식베이스 매칭 중…`);
        updateProgress(base+75/files.length, `📋 [${f.name}] 3번 구성성분 추출 중…`);
        const parsed = await parseMSDSFile(f);
        parsedList.push(parsed);
        updateProgress(((i+1)*100)/files.length, `✅ [${parsed.name}] → 신뢰도: ${parsed.matchConfidence} · 성분 ${parsed.composition?.length||0}개`);
    }
    updateProgress(100,'🎉 파싱 완료 — 구성성분을 검수한 후 등록하세요'); await sleep(300);

    document.getElementById('parseResult').classList.remove('hidden');
    document.getElementById('parseResultSummary').innerHTML = parsedList.map(p=>`<b>${p.name}</b>`).join(', ');
    document.getElementById('parseDetail').innerHTML = parsedList.map(p=>`
        <div class="border-b border-emerald-100 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
            <p class="font-bold text-emerald-900">📦 ${p.name}</p>
            <p class="text-gray-600 mt-1">
                <span class="parse-highlight">CAS ${p.cas}</span>
                <span class="parse-highlight">${p.signalWord}</span>
                <span class="parse-highlight">픽토그램 ${p.pictograms.length}종</span>
                ${p.isSpecial?'<span class="parse-highlight" style="background:linear-gradient(120deg,#fecaca,#f87171)">특별관리물질</span>':''}
                <span class="parse-highlight" style="background:linear-gradient(120deg,#bfdbfe,#93c5fd)">성분 ${p.composition?.length||0}개</span>
            </p>
            <p class="text-gray-500 text-[10px] mt-1">📁 원본: ${p.sourceFile} · 신뢰도: <b class="${p.matched?'text-emerald-700':'text-amber-700'}">${p.matchConfidence}</b></p>
        </div>
    `).join('');

    lastParsedMaterials = parsedList;
    const first = parsedList[0];
    const regProduct = document.getElementById('reg-product');
    if(regProduct) regProduct.value = first.name;
    updateAIPreview(first);

    renderCompositionReview(first);
}

function updateAIPreview(m){
    const box = document.getElementById('aiPreviewBody');
    if(!box) return;
    if(!m){
        box.innerHTML = '<p class="text-gray-400 text-center py-8"><i class="fa-solid fa-file-arrow-up text-2xl mb-2 block"></i>파일을 업로드하면<br>여기에 결과가 표시됩니다</p>';
        return;
    }
    const ghsBadges = m.pictograms.map(p=>{
        const g = GHS_PICTOGRAMS[p];
        return `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-semibold">${g?g.name:p}</span>`;
    }).join(' ');

    box.innerHTML = `
        <div>
            <p class="font-bold text-gray-600">📄 제품명 / CAS</p>
            <p class="mt-1 bg-white border border-teal-100 rounded p-2 text-gray-800 text-[11px]">${m.name}<br><span class="font-mono text-gray-500">${m.cas}</span></p>
        </div>
        <div>
            <p class="font-bold text-gray-600">⚠ 신호어 · GHS 픽토그램</p>
            <div class="mt-1 bg-white border border-teal-100 rounded p-2">
                <span class="inline-block bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded mr-2">${m.signalWord}</span>
                <div class="flex flex-wrap gap-1 mt-1">${ghsBadges}</div>
            </div>
        </div>
        <div>
            <p class="font-bold text-gray-600">🧬 유해위험문구 (상위 3개)</p>
            <ul class="mt-1 bg-white border border-teal-100 rounded p-2 space-y-1 text-gray-700 text-[11px]">
                ${m.hazards.slice(0,3).map(h=>`<li>· ${h}</li>`).join('')}
            </ul>
        </div>
        <div>
            <p class="font-bold text-gray-600">🛡️ 권장 보호구</p>
            <p class="mt-1 bg-white border border-teal-100 rounded p-2 text-gray-700 text-[11px]">${m.ppe.join(', ')}</p>
        </div>
        <div>
            <p class="font-bold text-gray-600">⚖️ 법규 자동매칭</p>
            <ul class="mt-1 space-y-1 text-gray-700 text-[11px]">
                ${m.isSpecial?'<li>✓ 산안법 <b>특별관리물질</b></li>':''}
                ${m.isSpecial?'<li>✓ 작업환경측정 대상 (6개월)</li>':'<li>· 작업환경측정: 원본 확인</li>'}
                ${m.isSpecial?'<li>✓ 특수건강진단 대상 (12개월)</li>':''}
                <li>· 폐기물관리법: 지정폐기물</li>
            </ul>
        </div>
        ${m.isSpecial?'<div class="bg-rose-100 border border-rose-300 rounded p-2 text-rose-700 font-bold text-[11px]"><i class="fa-solid fa-triangle-exclamation mr-1"></i>특별관리물질 감지됨</div>':''}
        <div class="text-[10px] text-gray-500 pt-2 border-t border-teal-100">
            📊 매칭 신뢰도: <b class="${m.matched?'text-emerald-700':'text-amber-700'}">${m.matchConfidence}</b>
        </div>
    `;
}

function registerMaterial(){
    if(lastParsedMaterials && lastParsedMaterials.length > 0){
        const m = lastParsedMaterials[0];
        if(m.composition && m.composition.length > 0 && !m.compositionReviewed){
            alert('⚠️ MSDS 3번 「구성성분의 명칭 및 함유량」을 검수 완료해주세요.\n\n체크박스에 체크한 후 등록할 수 있습니다.');
            return;
        }
        if(m.composition && m.composition.length > 0 && (m.compositionSum < 90 || m.compositionSum > 110)){
            if(!confirm(`⚠️ 성분 합계가 ${m.compositionSum}% 입니다.\n\n일반적으로 100% ±5% 여야 합니다.\n그래도 등록하시겠습니까?`)){
                return;
            }
        }
    }

    const product = document.getElementById('reg-product').value.trim();
    const dept = document.getElementById('reg-dept').value;
    const process = document.getElementById('reg-process').value.trim();
    const usage = document.getElementById('reg-usage').value;

    if(!product){ alert('제품명을 입력하세요. (파일을 업로드하면 자동 채워집니다)'); return; }
    if(!dept){ alert('사용 부서를 선택하세요.'); return; }

    let firstId = null;

    if(lastParsedMaterials && lastParsedMaterials.length > 0){
        lastParsedMaterials.forEach((m, i)=>{
            if(i===0) m.name = product;
            m.deptInfo = dept;
            m.processInfo = process;
            m.usageInfo = usage;
            MATERIALS.unshift(m);
            if(!firstId) firstId = m.id;
        });
        showToast(`✅ ${lastParsedMaterials.length}건 등록 완료 → ② MSDS 리스트로 이동합니다`);
        lastParsedMaterials = [];
    } else {
        const manual = JSON.parse(JSON.stringify(FALLBACK_TEMPLATE));
        manual.id = 'MAT_'+Date.now();
        manual.name = product;
        manual.subtitle = '수동 등록';
        manual.deptInfo = dept;
        manual.processInfo = process;
        manual.usageInfo = usage;
        manual.uploadedAt = new Date().toISOString();
        MATERIALS.unshift(manual);
        firstId = manual.id;
        showToast('✅ 수동 등록 완료 → ② MSDS 리스트로 이동합니다');
    }

    saveMATERIALS();

    selectedMaterialId = firstId;
    renderMaterialList();
    applyMaterialToForms(MATERIALS.find(m=>m.id===firstId));
    renderListTable();

    clearRegForm();

    setTimeout(()=>goToListTab(), 800);
}

function clearRegForm(){
    const ids = ['reg-product','reg-process','reg-usage','reg-dept'];
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('parseResult').classList.add('hidden');
    document.getElementById('compositionReviewArea').classList.add('hidden');
    document.getElementById('compositionReviewArea').innerHTML = '';
    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = false;
        regBtn.classList.remove('opacity-50','cursor-not-allowed');
    }
}

/* =========================================================
   [0] 공식 API 검수 설정
   ========================================================= */
const INSPECT_CONFIG = {
    proxyBase: '/api/inspect',
    cacheTTL: {
        success: 30 * 24 * 60 * 60 * 1000,
        failure: 1 * 24 * 60 * 60 * 1000
    },
    timeout: 10000
};
const InspectCache = {
    get(cas){
        try{
            const raw = localStorage.getItem('pfm_inspect_'+cas);
            if(!raw) return null;
            const obj = JSON.parse(raw);
            const ttl = obj.ok ? INSPECT_CONFIG.cacheTTL.success : INSPECT_CONFIG.cacheTTL.failure;
            if(Date.now() - obj.checkedAt > ttl) return null;
            return obj;
        }catch(e){ return null; }
    },
    set(cas, data){ try{ localStorage.setItem('pfm_inspect_'+cas, JSON.stringify(data)); }catch(e){} },
    del(cas){ localStorage.removeItem('pfm_inspect_'+cas); },
    clearAll(){
        Object.keys(localStorage).filter(k=>k.startsWith('pfm_inspect_')).forEach(k=>localStorage.removeItem(k));
    }
};
let apiConnected = false;
async function checkApiHealth(){
    try{
        const ctrl = new AbortController();
        setTimeout(()=>ctrl.abort(), 2000);
        const res = await fetch(INSPECT_CONFIG.proxyBase+'/health', { signal: ctrl.signal });
        apiConnected = res.ok;
    }catch(e){ apiConnected = false; }
    updateApiStatusPill();
}
function updateApiStatusPill(){
    const pill = document.getElementById('apiStatusPill');
    if(!pill) return;
    if(apiConnected){
        pill.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-emerald-700">공식 API 연결됨</span>';
        pill.className = 'inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-full';
    } else {
        pill.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 pulse-dot"></span><span class="text-amber-700">데모 모드 (프록시 미연결)</span>';
        pill.className = 'inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full';
    }
}
async function inspectByCas(cas, forceRefresh=false){
    cas = (cas||'').trim();
    if(!cas) throw new Error('CAS No.를 입력하세요');
    if(!forceRefresh){
        const hit = InspectCache.get(cas);
        if(hit) return { ...hit, fromCache: true };
    }
    let result;
    if(apiConnected){
        try{
            const ctrl = new AbortController();
            setTimeout(()=>ctrl.abort(), INSPECT_CONFIG.timeout);
            const res = await fetch(`${INSPECT_CONFIG.proxyBase}/${encodeURIComponent(cas)}${forceRefresh?'?refresh=true':''}`, { signal: ctrl.signal });
            if(!res.ok) throw new Error('HTTP '+res.status);
            result = await res.json();
            result.ok = true;
            result.checkedAt = Date.now();
        }catch(e){
            result = { ok:false, error:e.message, checkedAt:Date.now() };
        }
    } else {
        await new Promise(r=>setTimeout(r, 400+Math.random()*400));
        result = demoInspect(cas);
        result.checkedAt = Date.now();
        result.ok = true;
        result.demo = true;
    }
    InspectCache.set(cas, result);
    return result;
}
const DEMO_REG_DB = {
    '872-50-4':  { name:'NMP', kosha:true, nier:true,  nfa:false, cci:true,  tags:['특별관리','생식독성1B','산안법','화관법'] },
    '10124-43-3':{ name:'황산코발트', kosha:true, nier:true, nfa:false, cci:true, tags:['특별관리','발암성','산안법','화관법'] },
    '7786-81-4': { name:'황산니켈', kosha:true, nier:true, nfa:false, cci:true, tags:['특별관리','발암성','산안법','화관법'] },
    '1310-65-2': { name:'수산화리튬', kosha:true, nier:true, nfa:false, cci:false, tags:['부식성','산안법'] },
    '64-17-5':   { name:'에탄올', kosha:true, nier:false, nfa:true,  cci:false, tags:['인화성','위험물4류'] },
    '71-43-2':   { name:'벤젠', kosha:true, nier:true, nfa:true, cci:true, tags:['특별관리','발암성1A','산안법','화관법','위험물4류'] },
    '67-56-1':   { name:'메탄올', kosha:true, nier:true, nfa:true, cci:false, tags:['특별관리','급성독성','인화성','위험물4류'] },
    '50-00-0':   { name:'포름알데히드', kosha:true, nier:true, nfa:false, cci:true, tags:['특별관리','발암성1B','산안법','화관법'] },
    '1309-48-4': { name:'산화마그네슘', kosha:true, nier:false, nfa:false, cci:false, tags:['자극성'] },
    '64742-54-7':{ name:'광유계 윤활기유', kosha:true, nier:false, nfa:false, cci:false, tags:['건강유해성'] },
    '7664-93-9': { name:'황산', kosha:true, nier:true, nfa:false, cci:true, tags:['부식성','산안법','화관법'] },
    '7732-18-5': { name:'물', kosha:false, nier:false, nfa:false, cci:false, tags:[] }
};
function demoInspect(cas){
    const rec = DEMO_REG_DB[cas];
    if(!rec){
        return {
            casNo: cas, status: 'NO_MATCH',
            matched: { kosha:false, nier:false, nfa:false, cci:false },
            sources: {
                kosha:{ ok:true, hit:false, note:'MSDS 목록에 없음' },
                nier: { ok:true, hit:false, note:'화관법 등록 없음' },
                nfa:  { ok:true, hit:false, note:'위험물 아님' },
                cci:  { ok:true, hit:false, note:'화학물질안전관리정보 없음' }
            }
        };
    }
    const anyHit = rec.kosha || rec.nier || rec.nfa || rec.cci;
    return {
        casNo: cas, matchedName: rec.name,
        status: anyHit ? 'REGULATED' : 'NO_MATCH',
        matched: { kosha:rec.kosha, nier:rec.nier, nfa:rec.nfa, cci:rec.cci },
        tags: rec.tags,
        sources: {
            kosha: rec.kosha ? { ok:true, hit:true, note:'KOSHA MSDS 등재', name:rec.name } : { ok:true, hit:false },
            nier:  rec.nier  ? { ok:true, hit:true, note:'화관법 유독물질 해당' } : { ok:true, hit:false },
            nfa:   rec.nfa   ? { ok:true, hit:true, note:'소방법 지정 위험물' } : { ok:true, hit:false },
            cci:   rec.cci   ? { ok:true, hit:true, note:'화학물질안전관리정보 등재' } : { ok:true, hit:false }
        }
    };
}

/* =========================================================
   [신규] 자동 검수 → material 필드 반영
   ========================================================= */
function applyInspectionToMaterial(material, inspection){
    if(!material || !inspection || !inspection.ok) return false;

    let updated = false;
    const tags = inspection.tags || [];
    const matched = inspection.matched || {};

    if(!material.tags) material.tags = [];
    tags.forEach(t=>{
        if(!material.tags.includes(t)) { material.tags.push(t); updated = true; }
    });

    if(tags.some(t=>t.includes('특별관리'))){
        if(!material.isSpecial){ material.isSpecial = true; updated = true; }
    }

    const isCMR = tags.some(t=>t.includes('발암') || t.includes('변이') || t.includes('생식'));
    if(isCMR && !material.tags.includes('cmr')){
        material.tags.push('cmr');
        updated = true;
    }

    if(material.isSpecial || isCMR){
        if(!material.envTarget){ material.envTarget = true; material.envCycle = 6; updated = true; }
        if(!material.healthTarget){ material.healthTarget = true; material.healthCycle = 12; updated = true; }
    }

    if(!material.laws) material.laws = {};
    material.laws.kosha = material.laws.kosha || !!matched.kosha;
    material.laws.nier = material.laws.nier || !!matched.nier;
    material.laws.nfa = material.laws.nfa || !!matched.nfa;
    material.laws.cci = material.laws.cci || !!matched.cci;
    material.laws.checkedAt = inspection.checkedAt;
    material.laws.status = inspection.status;
    updated = true;

    if(inspection.matchedName && (!material.subtitle || material.subtitle === '수동 등록' || material.subtitle === '-')){
        material.subtitle = inspection.matchedName + ' (' + material.cas + ')';
        updated = true;
    }

    return updated;
}

/* =========================================================
   ⭐⭐⭐ [신규] 혼합물 전체 성분 CAS 병렬 조회
   ========================================================= */
async function inspectAllComponents(material, forceRefresh=false){
    if(!material) return null;

    // 조회 대상 CAS 수집 (대표 CAS + 성분 CAS)
    const casSet = new Set();
    if(material.cas && material.cas !== '-') casSet.add(material.cas);
    (material.composition || []).forEach(c=>{
        if(c.cas && c.cas !== '-') casSet.add(c.cas);
    });

    if(casSet.size === 0) return null;

    const casList = [...casSet];
    const results = [];

    // 병렬 조회
    await Promise.all(casList.map(async cas=>{
        try{
            const r = await inspectByCas(cas, forceRefresh);
            if(r && r.ok){
                results.push({ cas, inspection: r });
            }
        }catch(e){
            console.warn('[inspectAllComponents]', cas, e.message);
        }
    }));

    if(results.length === 0) return null;

    // 결과를 material.compInspections 에 저장 (상세 패널용)
    material.compInspections = results.map(x=>({
        cas: x.cas,
        matchedName: x.inspection.matchedName || null,
        status: x.inspection.status,
        matched: x.inspection.matched || {},
        tags: x.inspection.tags || [],
        checkedAt: x.inspection.checkedAt
    }));

    // 법규 union 통합 (하나라도 해당하면 대상)
    if(!material.laws) material.laws = {};
    material.laws.kosha = results.some(x=>x.inspection.matched?.kosha);
    material.laws.nier  = results.some(x=>x.inspection.matched?.nier);
    material.laws.nfa   = results.some(x=>x.inspection.matched?.nfa);
    material.laws.cci   = results.some(x=>x.inspection.matched?.cci);
    material.laws.checkedAt = Date.now();
    material.laws.status = results.some(x=>x.inspection.status==='REGULATED') ? 'REGULATED' : 'NO_MATCH';

    // 태그 통합
    if(!material.tags) material.tags = [];
    results.forEach(x=>{
        (x.inspection.tags||[]).forEach(t=>{
            if(!material.tags.includes(t)) material.tags.push(t);
        });
    });

    // 특별관리·CMR 자동 판정
    const allTags = results.flatMap(x=>x.inspection.tags||[]);
    if(allTags.some(t=>t.includes('특별관리'))) material.isSpecial = true;
    if(allTags.some(t=>t.includes('발암')||t.includes('변이')||t.includes('생식'))){
        if(!material.tags.includes('cmr')) material.tags.push('cmr');
    }
    if(material.isSpecial || material.tags.includes('cmr')){
        material.envTarget = true; material.envCycle = 6;
        material.healthTarget = true; material.healthCycle = 12;
    }

    return material.compInspections;
}

/* =========================================================
   단일 물질 자동 검수 (등록 직후 호출) — 이제 혼합물 지원
   ========================================================= */
async function autoInspectMaterial(materialId, showToastMsg=true){
    const m = MATERIALS.find(x=>x.id===materialId);
    if(!m){
        console.log('[autoInspect] material 없음:', materialId);
        return null;
    }

    // CAS도 없고 성분도 없으면 스킵
    const hasCas = m.cas && m.cas !== '-';
    const hasComponents = (m.composition||[]).some(c=>c.cas && c.cas!=='-');
    if(!hasCas && !hasComponents){
        console.log('[autoInspect] 스킵 (CAS 없음):', materialId);
        return null;
    }

    try{
        const result = await inspectAllComponents(m, false);
        if(result){
            saveMATERIALS();
            if(typeof renderListTable === 'function') renderListTable();
            if(typeof updateAllKPI === 'function') updateAllKPI();
            if(typeof applyMaterialToForms === 'function'){
                applyMaterialToForms(MATERIALS.find(x=>x.id===materialId));
            }
            if(showToastMsg && typeof showToast === 'function'){
                const regCnt = result.filter(x=>x.status==='REGULATED').length;
                if(regCnt > 0){
                    showToast(`🔍 자동검수 완료: ${result.length}개 CAS 조회, 규제 매칭 ${regCnt}건`);
                } else {
                    showToast(`🔍 자동검수 완료: ${result.length}개 CAS 조회, 매칭 없음`);
                }
            }
        }
        return result;
    }catch(e){
        console.warn('[autoInspect] 실패:', m.cas, e.message);
    }
    return null;
}

/* =========================================================
   ⭐ [수정] 백그라운드 자동조회 (혼합물 전체 성분 조회)
   ========================================================= */
let _autoInspectRunning = false;
let _autoInspectDone = false;  // ⭐ 세션 내 1회만 자동 실행

async function autoInspectAllPending(force=false){
    if(_autoInspectRunning) return;
    if(_autoInspectDone && !force) return;
    _autoInspectRunning = true;

    try{
        // 조회가 필요한 material 목록 수집
        const pending = MATERIALS.filter(m=>{
            // 이미 검수완료(laws.checkedAt) 있으면 스킵
            if(m.laws && m.laws.checkedAt) return false;

            // CAS든 성분이든 하나라도 있으면 대상
            const hasCas = m.cas && m.cas !== '-';
            const hasComp = (m.composition||[]).some(c=>c.cas && c.cas!=='-');
            return hasCas || hasComp;
        });

        if(pending.length === 0){
            _autoInspectDone = true;
            _autoInspectRunning = false;
            return;
        }

        console.log(`[autoInspectAllPending] ${pending.length}건 백그라운드 조회 시작`);
        insLog(`🤖 자동 검수 시작 (${pending.length}건 대기)`);

        const BATCH = 3;
        for(let i=0; i<pending.length; i+=BATCH){
            const batch = pending.slice(i, i+BATCH);
            await Promise.all(batch.map(async m=>{
                try{
                    const results = await inspectAllComponents(m, false);
                    if(results){
                        const regCnt = results.filter(x=>x.status==='REGULATED').length;
                        insLog(`  ✓ ${m.name} (${results.length}개 CAS) → 규제 ${regCnt}건`);
                    }
                }catch(e){
                    insLog(`  ✗ ${m.name} ${e.message}`);
                }
            }));
            await new Promise(r=>setTimeout(r, 200));
        }

        saveMATERIALS();
        if(typeof renderListTable === 'function') renderListTable();
        if(typeof updateAllKPI === 'function') updateAllKPI();
        insLog(`🎉 자동 검수 완료`);
        _autoInspectDone = true;
    } finally {
        _autoInspectRunning = false;
    }
}

function insLog(msg){
    const box = document.getElementById('insLog');
    if(!box) return;
    box.classList.remove('hidden');
    const p = document.createElement('p');
    p.innerHTML = `<span class="text-gray-400">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
}
async function inspectCasSingle(forceRefresh){
    const cas = document.getElementById('insCasInput').value.trim();
    if(!cas){ showToast('CAS No.를 입력하세요'); return; }
    openInspectModal(cas);
    try{
        insLog(`🔍 ${cas} 조회 시작${forceRefresh?' (재조회)':''}`);
        const result = await inspectByCas(cas, forceRefresh);
        renderInspectModal(cas, result);
        insLog(`✅ ${cas} 완료 · ${result.fromCache?'캐시 사용':'신규 조회'} · ${result.status}`);

        if(result.ok){
            let anyUpdated = false;
            MATERIALS.forEach(m=>{
                // 대표 CAS 또는 성분 CAS가 일치하면 반영
                const isMatch = m.cas === cas || (m.composition||[]).some(c=>c.cas===cas);
                if(isMatch){
                    if(applyInspectionToMaterial(m, result)) anyUpdated = true;
                }
            });
            if(anyUpdated){
                saveMATERIALS();
                if(typeof applyMaterialToForms === 'function' && selectedMaterialId){
                    applyMaterialToForms(MATERIALS.find(m=>m.id===selectedMaterialId));
                }
            }
        }

        renderListTable();
        updateInspectKpi();
    }catch(e){
        renderInspectModal(cas, { ok:false, error:e.message });
        insLog(`❌ ${cas} 실패: ${e.message}`);
    }
}
async function reinspectAll(){
    const btn = document.getElementById('btnReinspectAll');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spin mr-1"></i>재조회 중…';
    const list = MATERIALS.filter(m=>(m.cas && m.cas!=='-') || (m.composition||[]).some(c=>c.cas));
    insLog(`🚀 전체 재조회 시작 (${list.length}건, 성분별 병렬 조회)`);
    const BATCH = 3;
    for(let i=0; i<list.length; i+=BATCH){
        const batch = list.slice(i, i+BATCH);
        await Promise.all(batch.map(async m=>{
            try{
                const results = await inspectAllComponents(m, true);
                if(results){
                    const regCnt = results.filter(x=>x.status==='REGULATED').length;
                    insLog(`  · ${m.name} (${results.length}개 CAS) → 규제 ${regCnt}건`);
                }
            }catch(e){
                insLog(`  · ${m.name} ❌ ${e.message}`);
            }
        }));
    }
    saveMATERIALS();
    renderListTable();
    updateInspectKpi();
    insLog(`🎉 전체 재조회 완료`);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate mr-1"></i>전체 재조회';
    showToast('✅ 전체 재조회 완료');
}
function clearInspectCache(){
    if(!confirm('모든 검수 캐시를 삭제하시겠습니까?')) return;
    InspectCache.clearAll();
    _autoInspectDone = false;  // 캐시 초기화 시 자동조회 재실행 허용
    renderListTable();
    updateInspectKpi();
    showToast('🗑 캐시 초기화 완료');
}
function openInspectModal(cas){
    document.getElementById('insModalCas').textContent = 'CAS No. ' + cas;
    document.getElementById('inspectModalBody').innerHTML = '<p class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner spin mr-2"></i>4개 공식 API 병렬 조회 중…</p>';
    const m = document.getElementById('inspectModal');
    m.classList.remove('hidden'); m.classList.add('flex');
}
function closeInspectModal(){
    const m = document.getElementById('inspectModal');
    m.classList.add('hidden'); m.classList.remove('flex');
}
function renderInspectModal(cas, r){
    const body = document.getElementById('inspectModalBody');
    if(!r.ok){
        body.innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>조회 실패: ${r.error||'알수없는 오류'}</div>`;
        return;
    }
    const sources = r.sources || {};
    const srcMeta = [
        { key:'kosha', label:'KOSHA MSDS', icon:'fa-shield-halved', desc:'한국산업안전보건공단 물질안전보건자료' },
        { key:'nier',  label:'환경공단 화학물질', icon:'fa-leaf', desc:'한국환경공단 화학물질정보 (화관법)' },
        { key:'nfa',   label:'소방청 위험물', icon:'fa-fire',  desc:'국가위험물정보 (위험물안전관리법)' },
        { key:'cci',   label:'화학물질안전관리정보', icon:'fa-flask', desc:'기후에너지환경부 화학물질안전원' }
    ];
    const statusBadge = r.status==='REGULATED'
        ? '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-black text-xs">⚠ 규제 대상</span>'
        : '<span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-black text-xs">매칭 없음</span>';
    const tags = (r.tags||[]).map(t=>`<span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded">${t}</span>`).join(' ');
    body.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100">
            <div>
                <p class="text-xs text-gray-500">물질명 (매칭): <b class="text-gray-800">${r.matchedName||'-'}</b></p>
                <div class="flex gap-1 mt-1 flex-wrap">${tags}</div>
            </div>
            ${statusBadge}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            ${srcMeta.map(s=>{
                const src = sources[s.key] || {};
                const hit = r.matched && r.matched[s.key];
                return `
                <div class="border ${hit?'border-rose-200 bg-rose-50/40':'border-gray-200 bg-white'} rounded-lg p-3">
                    <div class="flex items-center justify-between mb-1">
                        <p class="text-xs font-black text-gray-800"><i class="fa-solid ${s.icon} mr-1 ${hit?'text-rose-600':'text-gray-400'}"></i>${s.label}</p>
                        ${hit?'<span class="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">해당</span>':'<span class="bg-gray-100 text-gray-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">-</span>'}
                    </div>
                    <p class="text-[11px] text-gray-500">${s.desc}</p>
                    <p class="text-[11px] text-gray-700 mt-1">${src.note||(hit?'매칭됨':'해당 없음')}</p>
                </div>`;
            }).join('')}
        </div>
        <div class="mt-3 bg-slate-50 rounded-lg p-3 text-[11px] text-gray-600 flex items-center justify-between flex-wrap gap-2">
            <span><i class="fa-solid fa-clock mr-1"></i>조회 시각: ${new Date(r.checkedAt).toLocaleString()}</span>
            <span>${r.fromCache?'📦 캐시 사용':'🌐 신규 조회'} ${r.demo?'· 데모 모드':''}</span>
        </div>
    `;
}

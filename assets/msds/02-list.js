/* =========================================================
   ② MSDS 리스트 상태
   ========================================================= */
let list2State = {
    page: 1,
    pageSize: 10,
    filter: { dept:'', process:'', hazard:'', law:'', search:'' },
    filtered: [],
    selectedIds: new Set()
};

function renderListTable(){
    const tbody = document.getElementById('listTableBody');
    const emptyState = document.getElementById('listEmptyState');
    if(!tbody) return;

    const f = list2State.filter;
    const kw = f.search.trim().toLowerCase();
    let filtered = MATERIALS.filter(m=>{
        const dept = (m.deptInfo||m.dept||'').toString();
        const process = (m.processInfo||m.process||'').toString();
        if(f.dept && !dept.includes(f.dept)) return false;
        if(f.process && !process.includes(f.process)) return false;
        if(f.hazard === 'special' && !m.isSpecial) return false;
        if(f.hazard === 'cmr' && !(m.tags||[]).includes('cmr')) return false;
        if(f.hazard === 'carcino' && !((m.tags||[]).includes('carcino') || (m.hazards||[]).some(h=>h.includes('발암')))) return false;
        if(f.hazard === 'repro' && !((m.hazards||[]).some(h=>h.includes('생식')))) return false;
        if(f.hazard === 'flam' && !(m.pictograms||[]).includes('GHS02')) return false;
        if(f.law){
            if(f.law === '산업안전보건법' && !m.isSpecial) return false;
            if(f.law === '위험물안전관리법' && !(m.pictograms||[]).includes('GHS02')) return false;
        }
        if(kw){
            const target = (m.name+' '+(m.cas||'')+' '+dept+' '+process+' '+(m.manufacturer||'')).toLowerCase();
            if(!target.includes(kw)) return false;
        }
        return true;
    });

    list2State.filtered = filtered;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / list2State.pageSize));
    if(list2State.page > totalPages) list2State.page = totalPages;
    const start = (list2State.page - 1) * list2State.pageSize;
    const pageData = filtered.slice(start, start + list2State.pageSize);

    if(MATERIALS.length === 0){
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
    } else if(pageData.length === 0){
        emptyState.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-gray-400 text-xs"><i class="fa-solid fa-filter-circle-xmark text-2xl mb-2 block"></i>필터 조건에 맞는 항목이 없습니다. <button onclick="resetFilter2()" class="text-teal-600 underline ml-1">필터 초기화</button></td></tr>`;
    } else {
        emptyState.classList.add('hidden');
        tbody.innerHTML = pageData.map(m=>{
            const cache = InspectCache.get(m.cas);
            let apiCell;
            if(!m.cas || m.cas==='-'){
                apiCell = `<span class="text-[10px] text-gray-400">CAS 없음</span>`;
            } else if(!cache){
                // ⭐ 자동조회 대기중 표시
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-blue-50 border border-blue-300 text-blue-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-blue-100"><i class="fa-solid fa-spinner spin mr-1"></i>자동조회 중…</button>`;
            } else if(cache.status==='REGULATED'){
                const cnt = Object.values(cache.matched||{}).filter(Boolean).length;
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-rose-200"><i class="fa-solid fa-triangle-exclamation mr-1"></i>규제 매칭 ${cnt}건</button>`;
            } else {
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-emerald-100"><i class="fa-solid fa-check mr-1"></i>매칭 없음</button>`;
            }

            const ghsHtml = (m.pictograms||[]).map(code=>{
                const g = GHS_PICTOGRAMS[code];
                return `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold" title="${g?g.name:code}">${g?g.name.substring(0,4):code}</span>`;
            }).join(' ') || '<span class="text-gray-400 text-[10px]">-</span>';

            // ⭐⭐⭐ 법규 자동매칭 - material.laws 우선, 없으면 cache 참조
            const lawTags = [];
            if(m.isSpecial) lawTags.push('<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold">특별관리</span>');
            if((m.tags||[]).includes('cmr')) lawTags.push('<span class="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">CMR</span>');
            if((m.pictograms||[]).includes('GHS02')) lawTags.push('<span class="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">위험물</span>');

            // ⭐ material.laws 에서 법규 매칭 정보 우선 사용
            if(m.laws){
                if(m.laws.kosha) lawTags.push('<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold" title="산업안전보건법">산안법</span>');
                if(m.laws.nier) lawTags.push('<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold" title="화학물질관리법">화관법</span>');
                if(m.laws.nfa) lawTags.push('<span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold" title="위험물안전관리법">소방법</span>');
                if(m.laws.cci) lawTags.push('<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold" title="화학물질안전원">화안원</span>');
            } else if(cache?.tags){
                cache.tags.slice(0,2).forEach(t=>lawTags.push(`<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">${t}</span>`));
            }

            const lawHtml = lawTags.length > 0
                ? lawTags.join(' ')
                : (m.cas && m.cas!=='-' ? '<span class="text-blue-500 text-[10px]"><i class="fa-solid fa-spinner spin mr-1"></i>분석중</span>' : '<span class="text-gray-400 text-[10px]">-</span>');

            const dept = m.deptInfo || m.dept || '-';
            const process = m.processInfo || m.process || '';
            const deptDisplay = process ? `${dept}<br><span class="text-gray-500 text-[10px]">${process}</span>` : dept;

            const regDate = m.uploadedAt ? new Date(m.uploadedAt).toISOString().slice(0,10) : '-';
            const isChecked = list2State.selectedIds.has(m.id) ? 'checked' : '';

            return `
                <tr class="hover:bg-teal-50 cursor-pointer" onclick="openDetailPanel('${m.id}')">
                    <td class="px-3 py-2.5" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isChecked} onchange="toggleSelect2('${m.id}',this.checked)">
                    </td>
                    <td class="px-3 py-2.5">
                        <p class="font-bold text-gray-900">${m.name}</p>
                        <p class="text-[10px] text-gray-500">${m.manufacturer||''}</p>
                    </td>
                    <td class="px-3 py-2.5 text-gray-600 font-mono">${m.cas||'-'}</td>
                    <td class="px-3 py-2.5"><p class="text-gray-800 text-[11px]">${deptDisplay}</p></td>
                    <td class="px-3 py-2.5 text-center"><div class="flex justify-center gap-1 flex-wrap">${ghsHtml}</div></td>
                    <td class="px-3 py-2.5 text-center"><div class="flex justify-center gap-1 flex-wrap">${lawHtml}</div></td>
                    <td class="px-3 py-2.5 text-center">${apiCell}</td>
                    <td class="px-3 py-2.5 text-center text-gray-600 text-[10px]">${regDate}</td>
                    <td class="px-3 py-2.5 text-center whitespace-nowrap" onclick="event.stopPropagation()">
                        <button onclick="viewInLabelTab('${m.id}')" class="text-teal-600 hover:text-teal-800 mr-2" title="경고표지 보기"><i class="fa-solid fa-tag"></i></button>
                        ${m.cas && m.cas!=='-' ? `<button onclick="document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(true);" class="text-indigo-600 hover:text-indigo-800 mr-2" title="재조회"><i class="fa-solid fa-rotate"></i></button>`:''}
                        <button onclick="deleteMaterial('${m.id}')" class="text-rose-600 hover:text-rose-800" title="삭제"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
        }).join('');
    }

    document.getElementById('list-total-count').textContent = MATERIALS.length;
    document.getElementById('list-shown-count').textContent = total;
    const info = document.getElementById('list-filter-info');
    const isFiltered = f.dept || f.process || f.hazard || f.law || f.search;
    if(isFiltered){
        info.classList.remove('hidden');
        info.textContent = `(필터 적용 중)`;
    } else {
        info.classList.add('hidden');
    }

    renderPagination2(totalPages);
    updateAllKPI();

    // ⭐⭐⭐ 리스트 렌더링 후 미조회 CAS 자동 백그라운드 조회 (한 번만)
    if(typeof autoInspectAllPending === 'function'){
        setTimeout(()=>autoInspectAllPending(), 300);
    }
}

function renderPagination2(totalPages){
    const container = document.getElementById('list-pagination');
    if(!container) return;
    if(totalPages <= 1){ container.innerHTML = ''; return; }
    const cur = list2State.page;
    let html = '';
    html += `<button ${cur===1?'disabled':''} onclick="goToPage2(1)" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angles-left"></i></button>`;
    html += `<button ${cur===1?'disabled':''} onclick="goToPage2(${cur-1})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angle-left"></i></button>`;
    const startP = Math.max(1, cur-2);
    const endP = Math.min(totalPages, startP+4);
    for(let i=startP; i<=endP; i++){
        html += `<button onclick="goToPage2(${i})" class="px-3 py-1 text-xs border ${i===cur?'border-teal-500 bg-teal-500 text-white font-bold':'border-gray-300 hover:bg-slate-50'} rounded">${i}</button>`;
    }
    html += `<button ${cur===totalPages?'disabled':''} onclick="goToPage2(${cur+1})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angle-right"></i></button>`;
    html += `<button ${cur===totalPages?'disabled':''} onclick="goToPage2(${totalPages})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angles-right"></i></button>`;
    container.innerHTML = html;
}
function goToPage2(p){ list2State.page = p; renderListTable(); }
function changePageSize2(){
    list2State.pageSize = Number(document.getElementById('list-page-size').value);
    list2State.page = 1;
    renderListTable();
}
function applyFilter2(){
    list2State.filter = {
        dept: document.getElementById('f2-dept').value,
        process: document.getElementById('f2-process').value,
        hazard: document.getElementById('f2-hazard').value,
        law: document.getElementById('f2-law').value,
        search: document.getElementById('f2-search').value
    };
    list2State.page = 1;
    renderListTable();
    showToast('🔎 검색·필터 적용 완료');
}
function resetFilter2(){
    ['f2-dept','f2-process','f2-hazard','f2-law','f2-search'].forEach(id=>document.getElementById(id).value='');
    list2State.filter = { dept:'', process:'', hazard:'', law:'', search:'' };
    list2State.page = 1;
    renderListTable();
    showToast('필터 초기화 완료');
}
function toggleSelect2(id, checked){
    if(checked) list2State.selectedIds.add(id);
    else list2State.selectedIds.delete(id);
}
function toggleAllSelect2(cb){
    list2State.filtered.forEach(m=>{
        if(cb.checked) list2State.selectedIds.add(m.id);
        else list2State.selectedIds.delete(m.id);
    });
    renderListTable();
}
function deleteSelected2(){
    if(list2State.selectedIds.size === 0){ showToast('선택된 항목이 없습니다'); return; }
    if(!confirm(`선택된 ${list2State.selectedIds.size}건을 삭제하시겠습니까?`)) return;
    MATERIALS = MATERIALS.filter(m=>!list2State.selectedIds.has(m.id));
    list2State.selectedIds.clear();
    saveMATERIALS();
    renderMaterialList();
    renderListTable();
    showToast('✅ 선택 항목 삭제 완료');
}
function deleteMaterial(id){
    const m = MATERIALS.find(x=>x.id===id);
    if(!m) return;
    if(!confirm(`「${m.name}」을(를) 삭제하시겠습니까?`)) return;
    MATERIALS = MATERIALS.filter(x=>x.id!==id);
    list2State.selectedIds.delete(id);
    if(selectedMaterialId === id && MATERIALS.length > 0){
        selectedMaterialId = MATERIALS[0].id;
    }
    saveMATERIALS();
    renderMaterialList();
    renderListTable();
    if(MATERIALS.length > 0) applyMaterialToForms(MATERIALS.find(x=>x.id===selectedMaterialId));
    showToast('🗑 삭제 완료');
}
function openDetailPanel(id){
    const m = MATERIALS.find(x=>x.id===id);
    if(!m) return;
    document.getElementById('dp-name').textContent = m.name;
    document.getElementById('dp-cas').textContent = m.cas || '-';

    const specialBadge = m.isSpecial ? `
        <div class="bg-rose-50 border-l-4 border-rose-500 rounded-r-lg p-3">
            <p class="text-xs font-bold text-rose-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>특별관리물질</p>
            <p class="text-xs text-rose-600 mt-1">임신 중 노출 시 태아에게 해를 끼칠 우려. 특별관리 필요.</p>
        </div>` : '';

    const ghsBadges = (m.pictograms||[]).map(code=>{
        const g = GHS_PICTOGRAMS[code];
        return `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-semibold text-xs">${g?g.name:code}</span>`;
    }).join(' ') || '<span class="text-gray-400 text-xs">해당 없음</span>';

    let compHtml = '';
    if(m.composition && m.composition.length > 0){
        compHtml = `
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">구성성분 (MSDS 3번)</p>
            <div class="bg-slate-50 rounded-lg p-3">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300 text-gray-600">
                            <th class="text-left py-1">물질명</th>
                            <th class="text-left py-1">CAS</th>
                            <th class="text-right py-1">함유량</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${m.composition.map(c=>`
                            <tr class="border-b border-gray-200">
                                <td class="py-1">${c.name}</td>
                                <td class="py-1 font-mono text-[10px]">${c.cas}</td>
                                <td class="py-1 text-right">${c.content}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p class="text-[10px] text-gray-500 mt-2">합계: <b>${m.compositionSum||0}%</b> ${m.compositionReviewed?'· ✅ 검수완료':''}</p>
            </div>
        </div>`;
    }

    // ⭐⭐⭐ 법규 자동매칭 결과 표시
    let lawsHtml = '';
    if(m.laws){
        const lawItems = [];
        if(m.laws.kosha) lawItems.push('<li>✓ KOSHA MSDS <b>등재</b> (산업안전보건법)</li>');
        if(m.laws.nier) lawItems.push('<li>✓ 환경공단 <b>화관법 유독물질</b> 해당</li>');
        if(m.laws.nfa) lawItems.push('<li>✓ 소방청 <b>위험물</b> 지정 (위험물안전관리법)</li>');
        if(m.laws.cci) lawItems.push('<li>✓ 화학물질안전원 <b>안전관리정보</b> 등재</li>');
        if(m.envTarget) lawItems.push(`<li>✓ 작업환경측정 대상 (${m.envCycle||6}개월 주기)</li>`);
        if(m.healthTarget) lawItems.push(`<li>✓ 특수건강진단 대상 (${m.healthCycle||12}개월 주기)</li>`);

        if(lawItems.length > 0){
            const checkedDate = m.laws.checkedAt ? new Date(m.laws.checkedAt).toLocaleString() : '-';
            lawsHtml = `
            <div>
                <p class="text-xs font-bold text-gray-500 mb-1">⚖️ 법규 자동매칭 결과 <span class="text-[10px] text-gray-400">(공식 API 검수)</span></p>
                <ul class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1 text-xs text-indigo-900">
                    ${lawItems.join('')}
                </ul>
                <p class="text-[10px] text-gray-400 mt-1">📅 검수일시: ${checkedDate}</p>
            </div>`;
        }
    }

    document.getElementById('dp-body').innerHTML = `
        ${specialBadge}
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">기본 정보</p>
            <div class="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
                <p>제품명: <b>${m.name}</b></p>
                <p>CAS No.: <span class="font-mono">${m.cas||'-'}</span></p>
                <p>제조사: ${m.manufacturer||'-'}</p>
                <p>공급자: ${m.supplier||'-'}</p>
                <p>사용 부서: ${m.deptInfo||m.dept||'-'}</p>
                <p>사용 공정: ${m.processInfo||m.process||'-'}</p>
                <p>월 사용량: ${m.usageInfo||'-'} kg</p>
                <p>등록일: ${m.uploadedAt ? new Date(m.uploadedAt).toLocaleString() : '-'}</p>
            </div>
        </div>
        ${compHtml}
        ${lawsHtml}
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">신호어 · GHS 픽토그램</p>
            <div class="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                <span class="inline-block bg-red-600 text-white text-xs font-black px-3 py-1 rounded">${m.signalWord||'-'}</span>
                <div class="flex flex-wrap gap-1">${ghsBadges}</div>
            </div>
        </div>
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">유해위험문구</p>
            <ul class="bg-slate-50 rounded-lg p-3 space-y-1 text-xs text-gray-700">
                ${(m.hazards||[]).map(h=>`<li>· ${h}</li>`).join('') || '<li class="text-gray-400">-</li>'}
            </ul>
        </div>
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">권장 보호구</p>
            <p class="bg-slate-50 rounded-lg p-3 text-xs text-gray-700">${(m.ppe||[]).join(', ') || '-'}</p>
        </div>
        <div class="flex gap-2">
            <button onclick="viewInLabelTab('${m.id}'); closeDetailPanel();" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 rounded-lg">
                <i class="fa-solid fa-tag mr-1"></i>경고표지 보기
            </button>
            ${m.cas && m.cas!=='-' ? `<button onclick="autoInspectMaterial('${m.id}', true); closeDetailPanel();" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-2 px-4 rounded-lg"><i class="fa-solid fa-satellite-dish mr-1"></i>재검수</button>`:''}
            <button onclick="deleteMaterial('${m.id}'); closeDetailPanel();" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-4 rounded-lg">
                <i class="fa-solid fa-trash mr-1"></i>삭제
            </button>
        </div>
    `;

    document.getElementById('detailPanel').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function viewInLabelTab(id){
    selectedMaterialId = id;
    renderMaterialList();
    const m = MATERIALS.find(x=>x.id===id);
    if(m) applyMaterialToForms(m);
    goToLabelTab();
}
function exportList2Excel(){
    const rows = list2State.filtered.map((m,i)=>({
        '번호': i+1,
        '제품명': m.name,
        'CAS No.': m.cas||'-',
        '제조사': m.manufacturer||'-',
        '사용부서': m.deptInfo||m.dept||'-',
        '사용공정': m.processInfo||m.process||'-',
        '월사용량(kg)': m.usageInfo||'-',
        '신호어': m.signalWord||'-',
        '픽토그램': (m.pictograms||[]).join(', '),
        '특별관리물질': m.isSpecial ? 'Y' : 'N',
        'CMR': (m.tags||[]).includes('cmr') ? 'Y' : 'N',
        '산안법(KOSHA)': m.laws?.kosha ? 'Y' : 'N',
        '화관법(NIER)': m.laws?.nier ? 'Y' : 'N',
        '소방법(NFA)': m.laws?.nfa ? 'Y' : 'N',
        '화안원(CCI)': m.laws?.cci ? 'Y' : 'N',
        '작업환경측정': m.envTarget ? '대상' : '-',
        '특수건강진단': m.healthTarget ? '대상' : '-',
        '유해위험문구': (m.hazards||[]).join(' / '),
        '구성성분': (m.composition||[]).map(c=>`${c.name}(${c.cas}) ${c.content}`).join(' / '),
        '등록일': m.uploadedAt ? new Date(m.uploadedAt).toISOString().slice(0,10) : '-'
    }));
    if(rows.length === 0){ showToast('내보낼 데이터가 없습니다'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MSDS리스트');
    XLSX.writeFile(wb, 'MSDS리스트_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('📥 Excel 다운로드 완료');
}
function updateAllKPI(){
    const total = MATERIALS.length;
    const special = MATERIALS.filter(m=>m.isSpecial).length;
    const cmr = MATERIALS.filter(m=>(m.tags||[]).includes('cmr') || (m.hazards||[]).some(h=>h.includes('발암')||h.includes('생식')||h.includes('변이원'))).length;
    const envTarget = MATERIALS.filter(m=>m.envTarget || m.isSpecial || (m.hazards||[]).some(h=>h.includes('발암')||h.includes('생식'))).length;
    const healthTarget = MATERIALS.filter(m=>m.healthTarget || m.isSpecial).length;

    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
    set('k2-total', total);
    set('k2-special', special);
    set('k2-cmr', cmr);
    set('k2-env', envTarget);
    set('k2-health', healthTarget);
    set('hdr-total', total);
    set('hdr-special', special);

    const badge = document.getElementById('tabBadgeList');
    if(badge) badge.textContent = total;

    updateInspectKpi();
}
function updateInspectKpi(){
    let matched=0, nomatch=0, refresh=0;
    const withCas = MATERIALS.filter(m=>m.cas && m.cas!=='-');
    withCas.forEach(m=>{
        const c = InspectCache.get(m.cas);
        if(!c) refresh++;
        else if(c.status==='REGULATED') matched++;
        else nomatch++;
    });
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
    set('ins-total', withCas.length);
    set('ins-matched', matched);
    set('ins-nomatch', nomatch);
    set('ins-refresh', refresh);
}

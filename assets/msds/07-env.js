/* =========================================================
   [5] ④ 작업환경측정
   ========================================================= */
let materials = JSON.parse(localStorage.getItem('pfm_env_materials') || 'null');
if(!materials){
    materials = [
        {id:1,name:'N-Methyl-2-pyrrolidone (NMP)',cas:'872-50-4',site:'광양',dept:'양극재제조부',loc:'슬러리 믹싱실',cycle:6,twa:'10 ppm',date:'2024-02-20',val:'3.2',ratio:32,workers:12,special:'Y'},
        {id:2,name:'황산코발트',cas:'10124-43-3',site:'세종',dept:'전구체제조부',loc:'반응기실',cycle:6,twa:'0.02 mg/m³',date:'2024-01-15',val:'0.008',ratio:40,workers:8,special:'Y'},
        {id:3,name:'황산니켈',cas:'7786-81-4',site:'세종',dept:'전구체제조부',loc:'세척실',cycle:6,twa:'0.1 mg/m³',date:'2024-03-05',val:'0.045',ratio:45,workers:10,special:'Y'},
        {id:4,name:'수산화리튬',cas:'1310-65-2',site:'광양',dept:'양극재2공장',loc:'소성라인',cycle:6,twa:'0.5 mg/m³',date:'2023-11-10',val:'0.35',ratio:70,workers:6,special:'N'},
        {id:5,name:'에탄올',cas:'64-17-5',site:'포항',dept:'품질보증부',loc:'분석실',cycle:12,twa:'1000 ppm',date:'2024-04-01',val:'85',ratio:8.5,workers:4,special:'N'}
    ];
    saveMatLS();
}
function saveMatLS(){ localStorage.setItem('pfm_env_materials', JSON.stringify(materials)); }

function renderMat(list){
    const grid = document.getElementById('matGrid');
    const empty = document.getElementById('matEmpty');
    if(!grid) return;
    if(list.length===0){ grid.innerHTML=''; empty.classList.remove('hidden'); }
    else empty.classList.add('hidden');

    const today = new Date();
    let soon=0, bad=0, workers=0, locs=new Set();

    grid.innerHTML = list.map(m=>{
        const next = new Date(m.date); next.setMonth(next.getMonth()+m.cycle);
        const dday = Math.ceil((next-today)/86400000);
        const status = m.ratio>100 ? 'bad' : (dday<30 ? 'soon' : 'ok');
        if(dday<30 && dday>=0) soon++;
        if(m.ratio>100) bad++;
        workers += Number(m.workers);
        locs.add(m.site+'/'+m.loc);

        const badgeSpc = m.special==='Y' ? '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">🔴 특별관리</span>' : '';
        const badgeSt = status==='ok' ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">✅ 적합</span>'
                      : status==='soon' ? '<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded">⏰ 만료임박</span>'
                      : '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">⚠ 부적합</span>';
        const gaugeClass = m.ratio>100 ? 'gauge-bad' : (m.ratio>50 ? 'gauge-warn' : 'gauge-ok');
        const siteColor = {'포항':'bg-blue-100 text-blue-700','광양':'bg-emerald-100 text-emerald-700','세종':'bg-purple-100 text-purple-700','기타':'bg-gray-100 text-gray-700'}[m.site]||'bg-gray-100';

        return `
        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition">
            <div class="flex items-center justify-between mb-2">
                <div class="flex gap-1">${badgeSpc}${badgeSt}</div>
                <span class="text-[10px] ${siteColor} px-2 py-0.5 rounded-full font-bold">${m.site}</span>
            </div>
            <p class="text-sm font-black text-gray-900 leading-tight">${m.name}</p>
            <p class="text-[11px] text-gray-500 mt-0.5">CAS ${m.cas} · ${m.cycle}개월 주기</p>
            <div class="mt-3 space-y-1 text-[11px] text-gray-700">
                <p><i class="fa-solid fa-building text-gray-400 w-4"></i> ${m.dept}</p>
                <p><i class="fa-solid fa-location-dot text-gray-400 w-4"></i> ${m.loc}</p>
                <p><i class="fa-solid fa-users text-gray-400 w-4"></i> 노출자 <b>${m.workers}명</b></p>
            </div>
            <div class="mt-3 bg-slate-50 rounded-lg p-2">
                <div class="flex justify-between text-[11px] mb-1">
                    <span class="text-gray-600">최근 측정 (${m.date})</span>
                    <span class="font-bold text-gray-800">${m.val} / ${m.twa}</span>
                </div>
                <div class="gauge"><div class="gauge-fill ${gaugeClass}" style="width:${Math.min(m.ratio,100)}%"></div></div>
                <p class="text-right text-[10px] text-gray-500 mt-1">노출비율 <b class="${m.ratio>100?'text-rose-600':'text-gray-700'}">${m.ratio}%</b></p>
            </div>
            <div class="mt-3 flex items-center justify-between text-[11px]">
                <span class="text-gray-500"><i class="fa-solid fa-clock mr-1"></i>차기 ${next.toISOString().slice(0,10)}</span>
                <span class="font-bold ${dday<0?'text-rose-600':dday<30?'text-amber-600':'text-emerald-600'}">D${dday>=0?'-':'+'}${Math.abs(dday)}</span>
            </div>
            <div class="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                <button onclick="editMat(${m.id})" class="flex-1 bg-white border border-gray-300 hover:bg-slate-50 text-xs font-semibold py-1.5 rounded"><i class="fa-solid fa-pen mr-1"></i>편집</button>
                <button onclick="delMat(${m.id})" class="flex-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-1.5 rounded"><i class="fa-solid fa-trash mr-1"></i>삭제</button>
            </div>
        </div>`;
    }).join('');

    document.getElementById('k4-total').innerHTML = list.length+'<span class="text-xs text-gray-500"> 종</span>';
    document.getElementById('k4-soon').innerHTML = soon+'<span class="text-xs text-gray-500"> 건</span>';
    document.getElementById('k4-bad').innerHTML = bad+'<span class="text-xs text-gray-500"> 건</span>';
    document.getElementById('k4-worker').innerHTML = workers+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k4-loc').innerHTML = locs.size+'<span class="text-xs text-gray-500"> 개</span>';
}

function applyFilter4(){
    const site=document.getElementById('f4-site').value;
    const dept=document.getElementById('f4-dept').value.toLowerCase();
    const status=document.getElementById('f4-status').value;
    const q=document.getElementById('f4-search').value.toLowerCase();
    const today=new Date();
    const filtered = materials.filter(m=>{
        if(site && m.site!==site) return false;
        if(dept && !m.dept.toLowerCase().includes(dept)) return false;
        if(q && !(m.name.toLowerCase().includes(q)||m.cas.toLowerCase().includes(q))) return false;
        if(status){
            const next=new Date(m.date); next.setMonth(next.getMonth()+m.cycle);
            const dday=Math.ceil((next-today)/86400000);
            const st = m.ratio>100?'bad':(dday<30?'soon':'ok');
            if(st!==status) return false;
        }
        return true;
    });
    renderMat(filtered);
}
function resetMat(){
    ['f4-site','f4-dept','f4-status','f4-search'].forEach(id=>document.getElementById(id).value='');
    renderMat(materials);
}

let editMatId = null;
function openMatModal(){
    editMatId=null;
    document.getElementById('matModalTitle').textContent='측정물질 등록';
    ['m-name','m-cas','m-dept','m-loc','m-twa','m-date','m-val'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('m-site').value='포항';
    document.getElementById('m-cycle').value=6;
    document.getElementById('m-workers').value=0;
    document.getElementById('m-special').value='N';
    document.getElementById('matModal').classList.remove('hidden');
    document.getElementById('matModal').classList.add('flex');
}
function editMat(id){
    const m = materials.find(x=>x.id===id); if(!m) return;
    editMatId=id;
    document.getElementById('matModalTitle').textContent='측정물질 수정';
    document.getElementById('m-name').value=m.name; document.getElementById('m-cas').value=m.cas;
    document.getElementById('m-site').value=m.site; document.getElementById('m-dept').value=m.dept;
    document.getElementById('m-loc').value=m.loc; document.getElementById('m-cycle').value=m.cycle;
    document.getElementById('m-twa').value=m.twa; document.getElementById('m-date').value=m.date;
    document.getElementById('m-val').value=m.val; document.getElementById('m-workers').value=m.workers;
    document.getElementById('m-special').value=m.special;
    document.getElementById('matModal').classList.remove('hidden');
    document.getElementById('matModal').classList.add('flex');
}
function closeMatModal(){
    document.getElementById('matModal').classList.add('hidden');
    document.getElementById('matModal').classList.remove('flex');
}
function saveMat(){
    const obj = {
        name:document.getElementById('m-name').value, cas:document.getElementById('m-cas').value,
        site:document.getElementById('m-site').value, dept:document.getElementById('m-dept').value,
        loc:document.getElementById('m-loc').value, cycle:Number(document.getElementById('m-cycle').value),
        twa:document.getElementById('m-twa').value, date:document.getElementById('m-date').value,
        val:document.getElementById('m-val').value, workers:Number(document.getElementById('m-workers').value),
        special:document.getElementById('m-special').value, ratio:0
    };
    const twaN=parseFloat(obj.twa), valN=parseFloat(obj.val);
    if(twaN && valN) obj.ratio = Math.round((valN/twaN)*100*10)/10;
    if(!obj.name){ alert('물질명을 입력하세요'); return; }
    if(editMatId){
        const i = materials.findIndex(x=>x.id===editMatId);
        materials[i] = {...materials[i],...obj};
    } else {
        obj.id = Date.now(); materials.push(obj);
    }
    saveMatLS(); renderMat(materials); closeMatModal(); showToast('✅ 저장되었습니다');
}
function delMat(id){
    if(!confirm('삭제하시겠습니까?')) return;
    materials = materials.filter(m=>m.id!==id);
    saveMatLS(); renderMat(materials); showToast('삭제되었습니다');
}

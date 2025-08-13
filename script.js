// script.js
// 競馬ミニゲーム：フル強化版
// 方式C（PL × 慣性 × ブックメーカー固定オッズ）＋ UX拡張
// 追加：実況／終盤スロー／リプレイ／ハイライト／脚質／体調色／追い上げ矢印／通過順位表／軌跡／応援／クイズ／色カスタム
(() => {
  'use strict';

  // ====== 基本定数 ======
  const HORSE_NAMES = [
    "サンダーブレイカー","スターリーレジェンド","ミスティクイーン","クリムゾンアロー","エターナルブリーズ",
    "シャドウウィング","ブルーフェニックス","サンセットソング","エンジェルホープ","ライトニングスピリット",
    "ゴールデンラッシュ","ウィンドミルドリーム","グレイスフルムーン","ドラゴンブレード","シルバーストーム",
    "スカーレットローズ","オーロラグリッター","シャイニングホーク","ナイトバロン","フロストフラワー",
    "ヴァーミリオンサーフ","クロノスハート","ピュアセレナーデ","ファントムシープ","ジェイドウォーリア",
    "クレセントチャーム","ミラクルガーデン","ソーラーウイッシュ","ラピスブルーム","スプレンディッドアッシュ",
    "ヘリオスシンフォニー","ノーブルマスター","トワイライトリーフ","ヴェルベットスター","ストームリバー",
    "オリオンライト","ドリームギャラクシー","エメラルドセイル","インフィニティフロウ","シャインバイオレット",
    "ブリリアントペガサス","グロリアスタイド","ジェントルウルフ","ルナティックホープ","カーネリアンスピリット",
    "マジェスティックグロウ","オパールストライク","グラススパークル","エピックシリウス","バイタルシグナル",
    "モーニンググレイス","コスモスパイダー","フラッシュウィズダム","クリスタルリバー","サファイアレイン",
    "フェアリーダンサー","シンフォニックスター","オーシャンヴェール","グロウリーフ","フェザーシャドウ",
    "レジェンドセイル","スプリングミラージュ","ピクシーボルト","ローズセイバー","ヴァイオレットサンダー",
    "プリズムドーン","エルフィンフォース","ファイアフライムーン","トリックスターワン","アイリッシュベル",
    "ミッドナイトウイング","スタークラッシュ","マーブルシフォン","ラストウィッシュ","ミスティアッシュ",
    "サンライズシンボル","リリカルノーツ","リーフィアコメット","エンチャントブルー","カリスマシャワー",
    "ブルームスフィア","エタニティウルフ","シャンティウインド","セレスティアルベール","フォーチュンゲイル",
    "クリームドラゴン","エリートランナー","メテオグラス","ノクターナルローズ","スノーミラージュ",
    "ダイヤモンドクイン","ブリーズバロン","シャープスティング","メロウウィンド","マルスハート",
    "ギャラクシーラッシュ","スターリーブリーズ","ジェネシスシャイン","パールレイン","フィアレスファング"
  ];
  const NUM_HORSES=8, INIT_MONEY=1000;
  const FINISH_LINE=600, STEPS=20, STEP_MS=350;

  // 方式Cパラメータ
  const PL_BETA=0.03, PL_TRIALS=3000, INERTIA_LAMBDA=0.30;
  const MARGIN_WIN=0.08, MARGIN_PLACE=0.10, MARGIN_UMAREN=0.12;
  const ODDS_MIN=1.2, ODDS_MAX=80.0;

  // 調子
  const CONDITION_LABELS=["絶不調","不調","普通","好調","絶好調"];
  const CONDITION_RATES =[0.9, 0.95, 1.00, 1.05, 1.10];
  const CONDITION_PROBS =[0.1, 0.2, 0.4, 0.2, 0.1];

  // 脚質（演出用）
  const RUN_STYLES = ["先行","先行","先行","差し","差し","追込","自在","自在"]; // ランダム割当の母集団

  // 馬番カラー（保存可能）
  const DEFAULT_FRAME_COLORS = ["#ffffff","#111111","#d11","#1d4ed8","#eab308","#16a34a","#ea580c","#db2777"];
  let FRAME_COLORS = JSON.parse(localStorage.getItem("frameColors")||"null") || DEFAULT_FRAME_COLORS.slice();
  const colorForNum = i => FRAME_COLORS[i % FRAME_COLORS.length];

  // ====== 状態 ======
  let userMoney=INIT_MONEY;
  let currentHorses=[], currentOddsWin=[], currentOddsPlace=[], currentOddsUmaren={};
  let currentProbWin=[], currentProbPlace=[], currentProbUmaren={};
  let currentBets=[], raceOrderResult=[];
  let raceInProgress=false;
  let cheerIndex=null; // 応援馬
  let timeline=[];     // リプレイ用：各ステップのpositionsスナップショット
  let splitBoard=null; // 通過順位記録
  let quizState=null;  // ミニクイズ状態
  const nf = new Intl.NumberFormat('ja-JP');
  const pairKey=(a,b)=>(a<b?`${a}-${b}`:`${b}-${a}`);

  // ====== ユーティリティ ======
  const randInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  const randFloat=(a,b)=>Math.random()*(b-a)+a;
  function weightedRandom(probArray){ let s=0,r=Math.random(); for(let i=0;i<probArray.length;i++){ s+=probArray[i]; if(r<s) return i; } return probArray.length-1; }
  function clipOdds(v){ return Math.min(ODDS_MAX, Math.max(ODDS_MIN, v)); }
  function mean(a){ return a.reduce((s,x)=>s+x,0)/a.length; }
  function stdev(a){ const m=mean(a); const v=a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length; return Math.sqrt(Math.max(v,1e-12)); }
  function percentileRank(arr,x){ const s=[...arr].sort((a,b)=>a-b); let idx=s.findIndex(v=>v>=x); if(idx===-1) idx=s.length; return idx/arr.length; }
  function evPerYen(p,o){ return p*o; }

  // ====== 生成 ======
  function baseScore(h){ return h.speed*0.55 + h.stamina*0.40 + h.spurt*0.40; }
  function horseScore(h){ return baseScore(h)*h.condition_rate; }

  function generateHorses(){
    const horses=[], used=[];
    while(horses.length<NUM_HORSES){
      const idx=randInt(0,HORSE_NAMES.length-1);
      if(used.includes(idx)) continue; used.push(idx);
      const condIdx=weightedRandom(CONDITION_PROBS);
      const style = RUN_STYLES[randInt(0,RUN_STYLES.length-1)];
      horses.push({
        name: HORSE_NAMES[idx],
        speed: randInt(60,130),
        stamina: randInt(60,130),
        spurt: randInt(60,130),
        condition: condIdx,
        condition_name: CONDITION_LABELS[condIdx],
        condition_rate: CONDITION_RATES[condIdx],
        run_style: style
      });
    }
    return horses;
  }

  // ====== PL（勝率推定）→ 慣性 → 固定オッズ ======
  function abilityFromScore(score,beta=PL_BETA){ return Math.exp(beta*score); }
  function computeAbilities(horses,beta=PL_BETA){ return horses.map(h=>abilityFromScore(horseScore(h),beta)); }
  function sampleOrderPL(ab){
    const g=()=>{ let u=Math.random(); if(u<1e-12) u=1e-12; return -Math.log(-Math.log(u)); };
    const items=ab.map((a,i)=>({i,z:Math.log(a)+g()})).sort((x,y)=>y.z-x.z);
    return items.map(o=>o.i);
  }
  function estimateRaceProbsPL(ab,trials=PL_TRIALS){
    const n=ab.length, win=Array(n).fill(0), place=Array(n).fill(0), pairCount={};
    for(let t=0;t<trials;t++){
      const ord=sampleOrderPL(ab);
      win[ord[0]]++; place[ord[0]]++; place[ord[1]]++; place[ord[2]]++;
      const a=Math.min(ord[0],ord[1]), b=Math.max(ord[0],ord[1]); const k=`${a}-${b}`;
      pairCount[k]=(pairCount[k]||0)+1;
    }
    const probWin=win.map(x=>x/trials), probPlace=place.map(x=>x/trials), probUmaren={};
    for(let a=0;a<n;a++){ for(let b=a+1;b<n;b++){ const k=`${a}-${b}`; probUmaren[k]=(pairCount[k]||0)/trials; } }
    return {probWin, probPlace, probUmaren};
  }
  function inertialBlend(prev,prob,lambda=INERTIA_LAMBDA){ if(!prev||prev.length!==prob.length) return prob.slice(); return prob.map((p,i)=>lambda*prev[i]+(1-lambda)*p); }
  function bookmakerOdds(probWin,probPlace,probUmaren, mW=MARGIN_WIN,mP=MARGIN_PLACE,mU=MARGIN_UMAREN){
    const oddsWin=probWin.map(p=>clipOdds((1+mW)/Math.max(p,1e-6)));
    const oddsPlace=probPlace.map(p=>clipOdds((1+mP)/Math.max(p,1e-6)));
    const oddsUmaren={}; Object.entries(probUmaren).forEach(([k,p])=>oddsUmaren[k]=clipOdds((1+mU)/Math.max(p,1e-6)));
    return {oddsWin,oddsPlace,oddsUmaren};
  }

  // ====== 開催バッジ ======
  function renderBadge(){
    const el = document.getElementById('meet-badge');
    if (!el || !currentProbWin?.length) return;
    const s = stdev(currentProbWin);
    let label='普', cls='f', title='標準的なばらつき';
    if (s < 0.05){ label='堅'; cls='k'; title='上位が抜けて堅め'; }
    else if (s >= 0.08){ label='荒'; cls='a'; title='波乱含み'; }
    el.className = `badge ${cls}`;
    el.textContent = `開催:${label}`;
    el.title = title;
  }

  // ====== テーブル描画（人気列＆EV列） ======
  function fmtOdds(v){ return (typeof v==='number')? v.toFixed(1): v; }
  function evColor(ev){ if(ev>=1.05) return 'limegreen'; if(ev<=0.95) return 'crimson'; return 'gray'; }

  function renderHorsesTable(horses, oddsWin, oddsPlace){
    const ranks = [...currentProbWin].map((p,i)=>({i,p})).sort((a,b)=>b.p-a.p).reduce((acc,cur,idx)=>(acc[cur.i]=idx+1,acc),[]);
    let t='<table><tr><th>No</th><th>馬名</th><th>脚質</th><th>人気</th><th>調子</th><th>単勝</th><th>複勝</th><th>EV</th></tr>';
    for(let i=0;i<horses.length;i++){
      const p=currentProbWin?.[i]??0, o=oddsWin?.[i]??1.0, ev=evPerYen(p,o);
      const condColor = horses[i].condition>=3 ? '#daf5e5' : (horses[i].condition<=1 ? '#ffe0e0' : 'transparent');
      t+=`<tr style="background:${condColor}">
            <td>${i+1}</td>
            <td>${horses[i].name}</td>
            <td>${horses[i].run_style}</td>
            <td>${ranks[i]}人気</td>
            <td>${horses[i].condition_name}</td>
            <td>${fmtOdds(oddsWin[i])}</td>
            <td>${fmtOdds(oddsPlace[i])}</td>
            <td style="color:${evColor(ev)}">${ev.toFixed(2)}</td>
          </tr>`;
    }
    t+='</table>'; return t;
  }

  // ====== アドバイス（根拠トグル対応） ======
  function meanStdev(arr){ return {m:mean(arr), s:stdev(arr)}; }
  function generateAdvices(hs){
    const n=hs.length, speeds=hs.map(h=>h.speed), stams=hs.map(h=>h.stamina), totals=hs.map(h=>horseScore(h));
    const {m:ms,s:ss}=meanStdev(speeds), {m:mt,s:st}=meanStdev(stams), {m:mtot,s:stot}=meanStdev(totals);
    const fieldTight=stdev(currentProbWin||[]);
    const showReasons=!!document.getElementById('showReasons')?.checked;
    const adv=[];
    for(let i=0;i<n;i++){
      const h=hs[i], zs=(h.speed-ms)/(ss||1), zt=(h.stamina-mt)/(st||1), ztot=(horseScore(h)-mtot)/(stot||1);
      const ps=1-percentileRank(speeds,h.speed), pt=1-percentileRank(stams,h.stamina), pTot=1-percentileRank(totals,horseScore(h));
      const p=currentProbWin?.[i]??0, o=currentOddsWin?.[i]??1, ev=evPerYen(p,o);
      let c1 = ps>0.85&&zs>1 ? "先行力はトップクラス。展開が向けば押し切り可。" :
               ps>0.65 ? "スピード優位。好位抜け出しに期待。" :
               ps<0.35 ? "加速力不足で置かれる懸念。" : "平均的な先行力。展開次第。";
      let c2 = pt>0.85&&zt>1 ? "持久力抜群。終い確実。" :
               pt>0.65 ? "スタミナに余裕。粘れる。" :
               pt<0.35 ? "スタミナ不安。早仕掛けは危険。" : "標準的。仕掛け所次第。";
      const evFlag = ev>=1.05?"妙味あり": ev<=0.95?"割高":"フェア";
      const uncertain=(fieldTight<0.06)&&(p>0.10&&p<0.28);
      let c3 = uncertain ? "上位拮抗。単勝妙味薄、複勝や馬連で分散を。" :
               (p>0.35&&ev<0.95) ? "人気先行の恐れ。買うなら点数絞り。" :
               (p<0.12&&ev>=1.05) ? "人気薄だがデータは後押し。押さえ一考。" :
               (ztot>1 && pTot>0.8) ? "総合力で上位。順当。" :
               (ztot<-1 && pTot<0.2) ? "総合力で見劣り。展開待ち。" :
               `バランス標準。EVは${evFlag}。`;
      if(h.condition<=1){ c1=c1.replace("。","。調子割引必要。"); c2=c2.replace("。","。終盤に不安。"); }
      if(showReasons){ c3 += `（勝率 ${(p*100).toFixed(1)}%、オッズ ${o.toFixed(1)}、EV ${ev.toFixed(2)}）`; }
      adv.push([c1,c2,c3]);
    }
    return adv;
  }
  function renderAdvices(horses, advs){
    // 画像は同じフォルダ配置を想定
    const imgs=["img/Girl.png","img/horseMen.png","img/OldMen.png"], names=["早瀬","持川","総田"];
    let s=`<table style="width:100%; background:#f8fafc; font-size:14px;">
      <tr><th>馬</th>${names.map((n,i)=>`<th style="min-width:90px"><img src="${imgs[i]}" style="width:50px;height:50px;object-fit:cover;border-radius:100%;box-shadow:0 2px 6px #0002"><br><span style="font-size:95%;">${n}</span></th>`).join('')}</tr>`;
    for(let i=0;i<horses.length;i++){
      s+=`<tr><td><b>${i+1}: ${horses[i].name}</b><br><span style="font-size:90%;color:#28638b;">${horses[i].condition_name}・${horses[i].run_style}</span></td>
      <td>${advs[i][0]}</td><td>${advs[i][1]}</td><td>${advs[i][2]}</td></tr>`;
    }
    s+=`</table>`; return s;
  }

  // ====== レーストラックUI ======
  function createRaceTrack(horses){
    const track=document.getElementById('race-track'); track.innerHTML='';
    // ゴール
    const finish=document.createElement('div'); finish.className='finish-line';
    const flag=document.createElement('div'); flag.className='flag'; flag.textContent='🏁';
    track.appendChild(finish); track.appendChild(flag);
    // レーン
    horses.forEach((h,i)=>{
      const lane=document.createElement('div'); lane.className='track-lane';
      const label=document.createElement('div'); label.className='lane-label'; label.textContent=`${i+1}`;
      const chip=document.createElement('div'); chip.className='horse-chip'; chip.id=`horse-${i}`;
      chip.style.background='#fff';
      if(cheerIndex===i) chip.style.boxShadow='0 0 0 2px #f59e0b, 0 4px 10px #0003';
      const num=document.createElement('span'); num.className='num'; num.style.background=colorForNum(i); num.textContent=(i+1);
      const emoji=document.createElement('span'); emoji.className='emoji';
      emoji.textContent = h.run_style==="先行"?"🚀": h.run_style==="差し"?"⚡":"🌪";
      const name=document.createElement('span'); name.className='name'; name.textContent=h.name;
      chip.appendChild(num); chip.appendChild(emoji); chip.appendChild(name);
      lane.appendChild(label); lane.appendChild(chip); track.appendChild(lane);
    });
    // 軌跡キャンバスサイズ
    const cvs=document.getElementById('race-paths'); if(cvs){ const rect=track.getBoundingClientRect(); cvs.width=Math.max(800, Math.floor(rect.width)); }
  }
  function updateRaceTrack(positions, leadIndex){
    const track=document.getElementById('race-track'); const width=track.clientWidth||800; const finishX=width-48;
    const maxPos=Math.max(...positions,1);
    // ライブ順位
    const sorted=Array.from(positions.keys()).sort((a,b)=>positions[b]-positions[a]);
    const board=document.getElementById('live-board');
    board.innerHTML=sorted.slice(0, Math.min(sorted.length,8)).map((i,rank)=>(
      `<div class="row"><div class="rank">${rank+1}</div><div class="horse">${i+1}. ${currentHorses[i].name}</div></div>`
    )).join('');
    // 位置更新
    for(let i=0;i<positions.length;i++){
      const chip=document.getElementById(`horse-${i}`); if(!chip) continue;
      const ratio = Math.min(positions[i]/maxPos, 1);
      const x = 24 + ratio * (finishX-48);
      chip.style.left = `${x}px`;
      chip.classList.toggle('fast', leadIndex===i);
    }
  }
  // 軌跡描画（上位3頭）
  function drawPaths(timeline){
    const cvs=document.getElementById('race-paths'); if(!cvs) return; const ctx=cvs.getContext('2d');
    ctx.clearRect(0,0,cvs.width,cvs.height);
    if(!timeline.length) return;
    const steps=timeline.length;
    const last=timeline[steps-1];
    const order=Array.from(last.keys()).sort((a,b)=>last[b]-last[a]).slice(0,3);
    const track=document.getElementById('race-track'); const width=track.clientWidth||800; const finishX=width-48;
    const maxPos=Math.max(...last,1);
    order.forEach((idx,rank)=>{
      ctx.beginPath();
      for(let s=0;s<steps;s++){
        const positions=timeline[s];
        const ratio = Math.min(positions[idx]/maxPos,1);
        const x = 24 + ratio*(finishX-48);
        const laneY = 30 + idx*46 + 18;
        if(s===0) ctx.moveTo(x,laneY);
        else ctx.lineTo(x,laneY);
      }
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = ['#1d4ed8','#16a34a','#dc2626'][rank] || '#334155';
      ctx.stroke();
    });
  }

  // カウントダウン
  async function showCountdown(num=3){
    const wrap=document.getElementById('race-wrap');
    const overlay=document.createElement('div'); overlay.className='countdown'; overlay.id='countdown';
    overlay.textContent=num; wrap.appendChild(overlay);
    for(let n=num;n>=1;n--){ overlay.textContent=n; await sleep(520); }
    overlay.textContent="GO!"; await sleep(420); overlay.remove();
  }
  const sleep = ms => new Promise(r=>setTimeout(r, ms));

  // ====== サウンド（簡易・WebAudio） ======
  let audioCtx=null;
  function beep(freq=880, dur=120){
    if(!document.getElementById('audioToggle')?.checked) return;
    try{
      if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.frequency.value=freq; o.type='square'; g.gain.value=0.04;
      o.connect(g).connect(audioCtx.destination); o.start(); setTimeout(()=>o.stop(), dur);
    }catch(_){}
  }

  // ====== 実況 ======
  function postComment(msg, tone='info'){
    const c = document.getElementById('commentary');
    const div = document.createElement('div');
    div.className = tone; // 'info'|'good'|'warn'|'bad'
    div.textContent = `🗣️ ${msg}`;
    c.prepend(div);
  }
  // ★未定義だった実況関数の実装（安全な最小版）
  function genEventCall(deltaSorted){
    if(!deltaSorted || !deltaSorted.length) return "";
    // deltaSorted: [[index, delta], ...] 降順
    const [iTop, dTop] = deltaSorted[0];
    const [iDown, dDown] = deltaSorted[deltaSorted.length-1];
    if (dTop > 18) return `${currentHorses[iTop].name} が一気に加速！`;
    if (dDown < -12) return `${currentHorses[iDown].name} 伸び脚を欠いている…`;
    return "";
  }

  // ====== ミニクイズ ======
  function setupQuiz(){
    const idx=randInt(0,NUM_HORSES-1);
    quizState={idx, answer:null, paid:false};
    const qEl=document.getElementById('quiz');
    qEl.style.display='block';
    qEl.innerHTML=`<b>クイズ：</b> ${idx+1}番（${currentHorses[idx].name}）は <b>3着以内</b>に入る？ 
      <button id="qYes">はい</button> <button id="qNo">いいえ</button>
      <span id="qMsg" style="margin-left:8px;color:#555;"></span>`;
    document.getElementById('qYes').onclick=()=>{ quizState.answer=true; document.getElementById('qMsg').textContent='予想を受け付けました'; };
    document.getElementById('qNo').onclick =()=>{ quizState.answer=false; document.getElementById('qMsg').textContent='予想を受け付けました'; };
  }
  function settleQuiz(){
    if(!quizState || quizState.paid!==false || quizState.answer===null) return;
    const hit = raceOrderResult.slice(0,3).includes(quizState.idx);
    const msgEl=document.getElementById('qMsg');
    if(hit===quizState.answer){
      const bonus=100; userMoney+=bonus; msgEl.textContent=`正解！ボーナス+${bonus}円`;
    }else{
      msgEl.textContent=`ハズレ…次回リベンジ`;
    }
    quizState.paid=true;
    document.getElementById("money").innerText=`所持金：${nf.format(userMoney)}円`;
  }

  // ====== カラー編集モーダル ======
  function openColorModal(){
    const modal=document.getElementById('colorModal'), box=document.getElementById('colorInputs');
    box.innerHTML='';
    for(let i=0;i<FRAME_COLORS.length;i++){
      const w=document.createElement('div');
      w.innerHTML=`<label style="font-size:12px;">${i+1}枠 <input type="color" value="${FRAME_COLORS[i]}" id="color-${i}"></label>`;
      box.appendChild(w);
    }
    modal.style.display='flex';
  }
  function closeColorModal(){ document.getElementById('colorModal').style.display='none'; }
  function saveColors(){
    for(let i=0;i<FRAME_COLORS.length;i++){
      const v=document.getElementById(`color-${i}`).value; FRAME_COLORS[i]=v;
    }
    localStorage.setItem("frameColors", JSON.stringify(FRAME_COLORS));
    closeColorModal();
    for(let i=0;i<NUM_HORSES;i++){
      const num=document.querySelector(`#horse-${i} .num`); if(num) num.style.background=colorForNum(i);
    }
  }

  // ====== 既存：簡易進捗バー（フォールバック） ======
  function renderProgressBars(positions){
    let html=''; for(let i=0;i<NUM_HORSES;i++){
      html += `<div class="progress-bar">${currentHorses[i].name.slice(0,4)} | <span style="color:#88f">${'■'.repeat(Math.floor(positions[i]/40))}</span></div>`;
    }
    document.getElementById('race-progress').innerHTML=html;
  }

  // ====== 主要フロー ======
  function populateBetInputs(){ updateBetUI(); }
  function updateBetUI(){
    const type=document.getElementById('bet-type').value;
    let html='';
    const sel=(id)=>`<label>${id.includes('2')?'馬番2':'馬番'}: <select id="${id}">`+currentHorses.map((h,i)=>`<option value="${i}">${i+1}: ${h.name}</option>`).join('')+`</select></label>`;
    if(type==='win'||type==='place'){ html+=sel('bet-horse'); if(type==='place') html+='<span class="sub">（複数頭OK）</span>'; }
    else{ html+=sel('bet-horse1')+sel('bet-horse2')+' <span class="sub">（順序なし）</span>'; }
    document.getElementById('bet-inputs').innerHTML=html;
    const cheer=document.getElementById('cheerSelect'); if(cheer){ cheer.innerHTML='<option value="">—</option>'+currentHorses.map((h,i)=>`<option value="${i}">${i+1}: ${h.name}</option>`).join(''); }
  }
  function addBet(e){
    e.preventDefault();
    const type=document.getElementById('bet-type').value;
    const amount=parseInt(document.getElementById('bet-amount').value,10);
    if(!Number.isInteger(amount)||amount<=0){ alert("金額を正しく入力してください"); return; }
    if(type==='win'||type==='place'){
      const idx=parseInt(document.getElementById('bet-horse').value,10);
      currentBets.push({type, target:idx, amount});
    }else{
      const a=parseInt(document.getElementById('bet-horse1').value,10), b=parseInt(document.getElementById('bet-horse2').value,10);
      if(a===b){ alert("別々の馬を選んでください"); return; }
      currentBets.push({type:'umaren', target:[a,b].sort((x,y)=>x-y), amount});
    }
    updateBetList();
  }
  function renderEVText(b){
    let p=0,o=0; if(b.type==='win'){ p=currentProbWin[b.target]; o=currentOddsWin[b.target]; }
    else if(b.type==='place'){ p=currentProbPlace[b.target]; o=currentOddsPlace[b.target]; }
    else{ const k=pairKey(b.target[0],b.target[1]); p=currentProbUmaren[k]||0; o=currentOddsUmaren[k]||ODDS_MAX; }
    const ev=Math.round(p*o*b.amount), pPct=(p*100).toFixed(1);
    return `（的中確率: ${pPct}% / EV: ${nf.format(ev)}円）`;
  }
  function updateBetList(){
    let s=""; if(currentBets.length===0) s="現在の賭けリスト: なし";
    else{ s="<b>賭けリスト:</b><br>"; currentBets.forEach((b,i)=>{
      const label = b.type==='win'?'単勝': b.type==='place'?'複勝': `馬連 ${b.target[0]+1}-${b.target[1]+1}`;
      const name = b.type==='umaren'? `${currentHorses[b.target[0]].name}＆${currentHorses[b.target[1]].name}` : currentHorses[b.target].name;
      s+=`${label} (${name}) ${nf.format(b.amount)}円 ${renderEVText(b)} <button onclick="removeBet(${i})">削除</button><br>`;
    });}
    document.getElementById('bet-list').innerHTML=s;
  }
  function removeBet(i){ currentBets.splice(i,1); updateBetList(); }

  function finalizeBets(){
    if(raceInProgress) return;
    if(currentBets.length===0){ document.getElementById('bets-result').innerHTML="<span style='color:red'>賭けリストがありません。</span>"; return; }
    const total=currentBets.reduce((s,b)=>s+b.amount,0);
    if(total>userMoney){ document.getElementById('bets-result').innerHTML="<span style='color:red'>掛け金が所持金を超えています。</span>"; return; }
    document.getElementById('bets-result').innerHTML="<b>レース進行中！</b>";
    runRaceAnimation();
  }

  function nextRace(){ document.getElementById('race-result').innerHTML=''; runRace(); }
  function resetGame(){ userMoney=INIT_MONEY; currentBets=[]; document.getElementById('race-result').innerHTML=''; runRace(); }

  // ====== レース実行 ======
  async function runRace(){
    if(raceInProgress) return;
    userMoney = userMoney<=0 ? INIT_MONEY : userMoney;
    document.getElementById("money").innerText=`所持金：${nf.format(userMoney)}円`;

    currentHorses=generateHorses();

    // 勝率→慣性→オッズ
    const ab=computeAbilities(currentHorses, 0.03);
    let {probWin, probPlace, probUmaren}=estimateRaceProbsPL(ab, 3000);
    probWin=inertialBlend(currentProbWin, probWin); probPlace=inertialBlend(currentProbPlace, probPlace);
    let {oddsWin,oddsPlace,oddsUmaren}=bookmakerOdds(probWin,probPlace,probUmaren);
    currentProbWin=probWin; currentProbPlace=probPlace; currentProbUmaren=probUmaren;
    currentOddsWin=oddsWin; currentOddsPlace=oddsPlace; currentOddsUmaren=oddsUmaren;

    const adv=generateAdvices(currentHorses);
    document.getElementById('horses-table').innerHTML=renderHorsesTable(currentHorses,oddsWin,oddsPlace);
    document.getElementById('advices').innerHTML=renderAdvices(currentHorses,adv);
    renderBadge();

    // トラック初期化
    createRaceTrack(currentHorses);
    document.getElementById('commentary').innerHTML='';
    document.getElementById('race-progress').innerHTML='';
    document.getElementById('race-result').innerHTML='';
    document.getElementById('replayBtn').disabled=true;

    // 応援選択更新
    const cs=document.getElementById('cheerSelect'); cheerIndex = cs?.value ? parseInt(cs.value,10) : null;
    if(Number.isNaN(cheerIndex)) cheerIndex=null;

    // クイズ生成
    setupQuiz();

    populateBetInputs();
    currentBets=[]; updateBetList();
    raceInProgress=false;
  }

  async function runRaceAnimation(){
    raceInProgress=true; setRacingUI(true);
    const positions=Array(NUM_HORSES).fill(0);
    const finish=Array(NUM_HORSES).fill(false);
    raceOrderResult=[];
    timeline=[]; splitBoard=[];

    await showCountdown(3); beep(880,200);

    const splitMarks=[FINISH_LINE*0.33, FINISH_LINE*0.66];

    for(let step=0; step<STEPS; step++){
      const slow = document.getElementById('slowToggle')?.checked && step>STEPS*0.66;
      await sleep(slow ? STEP_MS*1.6 : STEP_MS);

      const before=positions.slice();
      for(let i=0;i<NUM_HORSES;i++){
        if(!finish[i]){
          const lateBoost = step>STEPS*0.65 ? 1.12 : 1.0;
          let stepval = currentHorses[i].speed*randFloat(0.2,0.5)
                      + currentHorses[i].stamina*randFloat(0.1,0.2)
                      + currentHorses[i].spurt*randFloat(0.1,0.3)*lateBoost
                      + randFloat(-10,10);
          const rs = currentHorses[i].run_style;
          if(rs==="先行" && step<STEPS*0.4) stepval*=1.06;
          if(rs==="追込" && step>STEPS*0.6) stepval*=1.08;

          stepval *= currentHorses[i].condition_rate;
          positions[i]+=stepval;
          if(positions[i]>FINISH_LINE && !finish[i]){ finish[i]=true; raceOrderResult.push(i); beep(1200,70); }
        }
      }

      // 実況（安全な実装）
      const deltas=positions.map((p,i)=>p-before[i]);
      const deltaSorted = deltas.map((d,i)=>[i,d]).sort((a,b)=>b[1]-a[1]);
      const call=genEventCall(deltaSorted);
      if(call) postComment(call);

      const maxPos=Math.max(...positions);
      [FINISH_LINE*0.33, FINISH_LINE*0.66].forEach((mk,idx)=>{
        if(!splitBoard[idx] && maxPos>=mk){
          const ord=Array.from(positions.keys()).sort((a,b)=>positions[b]-positions[a]);
          splitBoard[idx]=ord.slice(); postComment(idx===0?"中盤の隊列が固まってきた。":"最後の直線、勝負はここから！");
        }
      });

      updateRaceTrack(positions, raceOrderResult.length? raceOrderResult[0] : null);
      renderProgressBars(positions);
      timeline.push(positions.slice());

      if(raceOrderResult.length>=NUM_HORSES) break;
    }

    // 残りを距離降順で確定
    if(raceOrderResult.length<NUM_HORSES){
      const remain=[]; for(let i=0;i<NUM_HORSES;i++) if(!raceOrderResult.includes(i)) remain.push([i,positions[i]]);
      remain.sort((a,b)=>b[1]-a[1]); for(const [idx] of remain) raceOrderResult.push(idx);
    }

    drawPaths(timeline);
    showRaceResult();
    settleQuiz();
    raceInProgress=false; setRacingUI(false);
    document.getElementById('replayBtn').disabled=false;
  }

  function setRacingUI(disabled){
    // 走行中は入力系を無効化。ただし「リプレイ」ボタンは別管理。
    document.querySelectorAll('button, select, input').forEach(el=>{
      if(el.id==='replayBtn') return;
      el.disabled=disabled;
    });
  }

  function showRaceResult(){
    let html="<div class='result'><b>【レース結果】</b><br>";
    for(let p=0;p<3;p++){ const idx=raceOrderResult[p]; html+=`${p+1}着: ${currentHorses[idx].name} (No.${idx+1})<br>`; }

    let payout=0;
    currentBets.forEach(b=>{
      if(b.type==='win'){ if(raceOrderResult[0]===b.target) payout+= b.amount*currentOddsWin[b.target]; }
      else if(b.type==='place'){ if(raceOrderResult.slice(0,3).includes(b.target)) payout+= b.amount*currentOddsPlace[b.target]; }
      else{
        const wSet=new Set([raceOrderResult[0],raceOrderResult[1]]), bSet=new Set(b.target);
        const hit=(bSet.size===wSet.size && [...bSet].every(x=>wSet.has(x)));
        if(hit){ const k=pairKey(b.target[0],b.target[1]); payout+= b.amount*(currentOddsUmaren[k]||ODDS_MAX); }
      }
    });
    const total=currentBets.reduce((s,b)=>s+b.amount,0);
    html += payout===0? "<span style='color:red'>残念！的中無しです。</span><br>"
                       : `<span style='color:green'>おめでとう！払戻金：${nf.format(Math.floor(payout))}円</span><br>`;
    userMoney = userMoney - total + Math.floor(payout);

    const mid = splitBoard?.[0]||[], late = splitBoard?.[1]||[];
    const fmtRow = arr => arr.map((i,idx)=>`${idx+1}.${currentHorses[i].name.split('')[0]}(${i+1})`).slice(0,8).join(' / ');
    if(mid.length) html += `中間通過：${fmtRow(mid)}<br>`;
    if(late.length) html += `直線入口：${fmtRow(late)}<br>`;

    html += `<div style="margin-top:6px;">表彰：🥇${currentHorses[raceOrderResult[0]].name}　🥈${currentHorses[raceOrderResult[1]].name}　🥉${currentHorses[raceOrderResult[2]].name}</div>`;

    html += `現在の所持金：${nf.format(userMoney)}円<br>
      <div class="next-btns">
        <button onclick="nextRace()">継続</button>
        <button onclick="resetGame()">終了（リセット）</button>
        <button onclick="replayRace()" id="replay2">もう一度観る</button>
      </div>`;

    document.getElementById("money").innerText=`所持金：${nf.format(userMoney)}円`;
    document.getElementById('race-result').innerHTML=html+"</div>";
  }

  // ====== リプレイ ======
  async function replayRace(){
    if(!timeline.length) return;
    setRacingUI(true);
    createRaceTrack(currentHorses);
    const positions = Array(NUM_HORSES).fill(0);
    for(let s=0;s<timeline.length;s++){
      const frame=timeline[s];
      for(let i=0;i<NUM_HORSES;i++) positions[i]=frame[i];
      updateRaceTrack(positions, null);
      await sleep(180);
    }
    drawPaths(timeline);
    setRacingUI(false);
  }
  document.getElementById('replayBtn')?.addEventListener('click', replayRace);

  // ====== イベント ======
  document.addEventListener('DOMContentLoaded', ()=>{
    // 初期レース生成
    runRace();

    // 応援選択
    const cs=document.getElementById('cheerSelect');
    if(cs){ cs.addEventListener('change', ()=>{ cheerIndex = cs.value? parseInt(cs.value,10) : null; }); }

    // カラー編集
    document.getElementById('colorBtn')?.addEventListener('click', openColorModal);
    document.getElementById('colorCancel')?.addEventListener('click', closeColorModal);
    document.getElementById('colorSave')?.addEventListener('click', saveColors);

    // リプレイ別ボタン（ヘッダ側）
    document.getElementById('replayBtn')?.addEventListener('click', replayRace);
  });

  // ====== グローバル公開 ======
  window.runRace=runRace;
  window.updateBetUI=updateBetUI;
  window.addBet=addBet;
  window.finalizeBets=finalizeBets;
  window.removeBet=removeBet;
  window.nextRace=nextRace;
  window.resetGame=resetGame;
  window.replayRace=replayRace;
})();

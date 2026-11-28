import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import mapData from './map-data.json';
import { Shield, Factory, TrainFront, Radio, HeartPulse, Zap, Search, Settings, LogOut, Lock, Unlock, Check, Clock3, Plus, Pencil, Trash2, Users, X, Save, RefreshCw, Globe, Coins, ZoomIn, ZoomOut, MapPin } from 'lucide-react';
import './style.css';
import './economy.css';
import './map-editor.css';
import { FOCUS_CATALOG, describeFocus } from './focus-catalog.mjs';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Дополнение к Markdown: Discord-спойлеры ||текст|| и подчёркивание __текст__.
// Узлы создаются после sanitize, поэтому пользовательский HTML не исполняется.
function rehypeDiscord(){
  return tree => {
    const visit = (node, inCode=false) => {
      if (!node || !Array.isArray(node.children)) return;
      const codeContext = inCode || node.tagName === 'code' || node.tagName === 'pre';
      const next=[];
      for (const child of node.children) {
        if (child.type === 'text' && !codeContext) {
          const pattern = /(\|\|[\s\S]+?\|\||@@UNDERLINE_[\s\S]+?_END@@)/g;
          let last=0, match;
          while ((match=pattern.exec(child.value))) {
            if (match.index>last) next.push({...child,value:child.value.slice(last,match.index)});
            const token=match[0];
            if (token.startsWith('||')) next.push({type:'element',tagName:'span',properties:{className:['md-spoiler']},children:[{type:'text',value:token.slice(2,-2)}]});
            else next.push({type:'element',tagName:'span',properties:{className:['md-underline']},children:[{type:'text',value:token.slice(12,-6)}]});
            last=match.index+token.length;
          }
          if (last<child.value.length) next.push({...child,value:child.value.slice(last)});
        } else { visit(child,codeContext); next.push(child); }
      }
      node.children=next;
    };
    visit(tree);
  };
}
function discordSource(source=''){
  // Discord __underline__ конфликтует с CommonMark strong; временно экранируем его.
  return String(source).replace(/__(.+?)__/g,(_,text)=>`@@UNDERLINE_${text}_END@@`);
}
function MarkdownSpoiler({children}){
  const [revealed,setRevealed]=useState(false);
  return <span className={'md-spoiler'+(revealed?' revealed':'')} role="button" tabIndex={0} onClick={()=>setRevealed(v=>!v)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setRevealed(v=>!v);}}} title="Нажмите, чтобы раскрыть">{children}</span>;
}
function MarkdownContent({text}){
  return <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize,rehypeDiscord]} components={{span:({className,children,...props})=>className?.includes('md-spoiler')?<MarkdownSpoiler>{children}</MarkdownSpoiler>:<span className={className} {...props}>{children}</span>}}>{discordSource(text||'')}</ReactMarkdown></div>;
}
function MarkdownEditor({value,onChange,placeholder,rows=5}){
  const [preview,setPreview]=useState(false);
  return <div className="markdown-editor">
    <div className="markdown-editor-bar"><span>ФОРМАТИРОВАНИЕ: DISCORD MARKDOWN</span><div><button type="button" className={!preview?'active':''} onClick={()=>setPreview(false)}>Текст</button><button type="button" className={preview?'active':''} onClick={()=>setPreview(true)}>Предпросмотр</button></div></div>
    {preview?<div className="markdown-preview"><MarkdownContent text={value}/></div>:<textarea rows={rows} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>}
    <div className="markdown-help">**жирный** · *курсив* · __подчёркнутый__ · ~~зачёркнутый~~ · ||спойлер|| · &gt; цитата · # заголовок · - список · `код`</div>
  </div>;
}

const BRANCHES = [
  { id:'military', name:'Военное дело', icon:Shield, color:'#c66b55', desc:'Вооружение, тактика и вооружённые силы' },
  { id:'industry', name:'Промышленность', icon:Factory, color:'#d5a34e', desc:'Производство, материалы и инфраструктура' },
  { id:'logistics', name:'Транспорт и логистика', icon:TrainFront, color:'#78a8a0', desc:'Перевозки, снабжение и транспорт' },
  { id:'comms', name:'Связь и электроника', icon:Radio, color:'#7f9cc9', desc:'Коммуникации, вычисления и разведка' },
  { id:'medicine', name:'Медицина и биология', icon:HeartPulse, color:'#8bb17c', desc:'Здравоохранение и медицинские технологии' },
  { id:'energy', name:'Энергетика и наука', icon:Zap, color:'#b39bd4', desc:'Энергия, двигатели и фундаментальные разработки' }
];

const DEFAULT_COUNTRIES = [
  {code:'MI',name:'Королевство Монтескью-де-Искадрэ'},
  {code:'NF',name:'Северный Коммунистический Никонский Фронт'},
  {code:'CI',name:'Цитранская Империя Баклоред'}
];

const eraYear = tier => 1850 + Math.round((tier / 9) * 140);
// Старые записи могли иметь tier=0 по умолчанию, хотя год относится к более позднему этапу.
function getFocusTier(focus){
  // Поле tier — источник истины: SQL уже распределяет фокусы по 10 этапам.
  // Не пересчитываем tier=0 по году: это ошибочно переносило фокусы первого этапа.
  const raw = Number(focus?.tier);
  if (Number.isInteger(raw) && raw >= 0 && raw <= 9) return raw;

  // Резервный расчёт нужен только для старых записей без корректного tier.
  const year = Number(focus?.year);
  if (Number.isFinite(year)) {
    return Math.max(0, Math.min(9, Math.round(((year - 1850) * 9) / 140)));
  }
  return 0;
}
function makeDemoNodes(){
  return DEFAULT_COUNTRIES.flatMap(country => Object.entries(FOCUS_CATALOG).flatMap(([branchId,stages]) =>
    stages.flatMap((focuses,tier)=>focuses.map((title,slot)=>{
      const index=tier*10+slot;
      return {
        id:`${country.code}-${branchId}-${index+1}`,
        country_code:country.code, branch_id:branchId, title,
        description:describeFocus(branchId,tier,title),
        year:eraYear(tier),tier,slot,cost:50+tier*25+slot*5,
        prerequisites:index===0?[]:[`${country.code}-${branchId}-${index}`],
        status:'available',is_active:true,admin_completed:false
      };
    }))
  ));
}

function App(){
  const [session,setSession]=useState(null), [profile,setProfile]=useState(null);
  const [countries,setCountries]=useState(DEFAULT_COUNTRIES);
  const [countryCode,setCountryCode]=useState(DEFAULT_COUNTRIES[0]?.code||'MI');
  const [branch,setBranch]=useState('military'), [nodes,setNodes]=useState([]), [selected,setSelected]=useState(new Set());
  const [allSelections,setAllSelections]=useState([]), [players,setPlayers]=useState([]);
  const [playerCountryDrafts,setPlayerCountryDrafts]=useState({});
  const [reassigningPlayerId,setReassigningPlayerId]=useState(null);
  const [activeNode,setActiveNode]=useState(null), [query,setQuery]=useState('');
  const [adminMode,setAdminMode]=useState(false), [login,setLogin]=useState(true);
  const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [error,setError]=useState('');
  const [busy,setBusy]=useState(false), [selectionBusy,setSelectionBusy]=useState(false), [edit,setEdit]=useState(null), [showAdmin,setShowAdmin]=useState(false), [copyingTree,setCopyingTree]=useState(false);
  const [availableCountries,setAvailableCountries]=useState(DEFAULT_COUNTRIES);
  const [countryDraftName,setCountryDraftName]=useState('');
  const [countryDraftCode,setCountryDraftCode]=useState('');
  const [countryBusy,setCountryBusy]=useState(false);
  const [demo,setDemo]=useState(!supabase);
  const [mapOpen,setMapOpen]=useState(false);
  const [mapOwnership,setMapOwnership]=useState({23:'MI',25:'NF',65:'CI'});
  const [mapCellOwnership,setMapCellOwnership]=useState({});
  const [mapCountryColors,setMapCountryColors]=useState({});
  const [mapColorDraft,setMapColorDraft]=useState('#626b61');
  const [mapColorSaving,setMapColorSaving]=useState(false);
  const [mapEditMode,setMapEditMode]=useState(false);
  const [mapPaintCountry,setMapPaintCountry]=useState(DEFAULT_COUNTRIES[0]?.code||'MI');
  const [activeMapState,setActiveMapState]=useState(null);
  const [mapOwnerDraft,setMapOwnerDraft]=useState('');
  const [mapSaving,setMapSaving]=useState(false);
  const [mapZoom,setMapZoom]=useState(1);
  const [economyOpen,setEconomyOpen]=useState(false);
  const [economyCountry,setEconomyCountry]=useState(DEFAULT_COUNTRIES[0]?.code||'MI');
  const [economyData,setEconomyData]=useState(null);
  const [economyDraft,setEconomyDraft]=useState(null);
  const [economyLoading,setEconomyLoading]=useState(false);
  const [economySaving,setEconomySaving]=useState(false);
  const [currencies,setCurrencies]=useState([]);
  const [currencyFrom,setCurrencyFrom]=useState('');
  const [currencyTo,setCurrencyTo]=useState('');
  const [currencyAmount,setCurrencyAmount]=useState('1');
  const [currencyNew,setCurrencyNew]=useState({code:'',name:'',symbol:'',gold_value:'1'});
  const [currencyBusy,setCurrencyBusy]=useState(false);
  const [countryCurrencyCode,setCountryCurrencyCode]=useState('');
  const [contentPage,setContentPage]=useState('tree');
  const [publicPosts,setPublicPosts]=useState([]);
  const [countryEvents,setCountryEvents]=useState([]);
  const [newspaperPosts,setNewspaperPosts]=useState([]);
  const [newsReadKeys,setNewsReadKeys]=useState(new Set());
  const [contentDraft,setContentDraft]=useState({title:'',body:'',country_code:''});
  const [contentBusy,setContentBusy]=useState(false);
  const [contentError,setContentError]=useState('');


  useEffect(()=>{
    if(!supabase) { setNodes(makeDemoNodes()); return; }
    let alive=true;
    supabase.from('countries').select('code,name').eq('is_active',true).order('name').then(({data,error:e})=>{
      if(!alive)return;
      if(e){setError('Не удалось загрузить список стран: '+e.message);return;}
      if(data?.length){setCountries(data);setAvailableCountries(data);setCountryCode(current=>data.some(c=>c.code===current)?current:data[0].code);}
    });
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!session || !supabase) return;
    (async()=>{
      const {data:countryRows,error:countryError}=await supabase.from('countries').select('code,name').eq('is_active',true).order('name');
      if(countryError){setError('Не удалось загрузить страны: '+countryError.message);}
      else if(countryRows?.length){setCountries(countryRows);setAvailableCountries(countryRows);}
      const effectiveCountries=countryRows?.length?countryRows:countries;
      const {data:p}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
      setProfile(p); setCountryCode(effectiveCountries.some(c=>c.code===p?.country_code)?p.country_code:(effectiveCountries[0]?.code||'')); setAdminMode(!!p?.is_admin);
      let allNodes = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('focuses')
          .select('*')
          .order('year', { ascending: true })
          .order('tier', { ascending: true })
          .order('slot', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) {
          setError(error.message);
          break;
        }

        allNodes = [...allNodes, ...(data || [])];

        if (!data || data.length < pageSize) break;

        from += pageSize;
      }

      setNodes(allNodes);
      const {data:s}=await supabase.from('focus_selections').select('*');
      setAllSelections(s||[]);
      setSelected(new Set((s||[]).filter(x=>x.user_id===session.user.id && ['selected','approved','in_progress','completed'].includes(x.status)).map(x=>x.focus_id)));
      const {data:ps}=await supabase.from('profiles').select('id,display_name,email,is_admin,country_code');
      setPlayers(ps||[]);
      await loadContent();

    })();
    const channel=supabase.channel('live-tree')
      .on('postgres_changes',{event:'*',schema:'public',table:'focuses'},payload=>{
        setNodes(prev=>payload.eventType==='DELETE'?prev.filter(x=>x.id!==payload.old.id):[...prev.filter(x=>x.id!==payload.new.id),payload.new].sort((a,b)=>a.year-b.year));
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'focus_selections'},payload=>{
        setAllSelections(prev=>payload.eventType==='DELETE'?prev.filter(x=>x.id!==payload.old.id):[...prev.filter(x=>x.id!==payload.new.id),payload.new]);
      }).subscribe();
    return ()=>{supabase.removeChannel(channel)};
  },[session]);

  useEffect(()=>{
    if(!session) return;
    setSelected(new Set(allSelections.filter(x=>x.user_id===session.user.id && ['selected','approved','in_progress','completed'].includes(x.status)).map(x=>x.focus_id)));
  },[allSelections,session]);

  useEffect(()=>{
    if(!economyOpen)return;
    if(!supabase){
      const demoCurrencies=[{id:'gold',code:'GLD',name:'Золотой стандарт',symbol:'Au',gold_value:1},{id:'crown',code:'CRN',name:'Королевская крона',symbol:'₡',gold_value:0.5}];
      setCurrencies(demoCurrencies);setCurrencyFrom(v=>v||'GLD');setCurrencyTo(v=>v||'CRN');setCountryCurrencyCode(v=>v||'GLD');return;
    }
    let alive=true;
    supabase.from('arsenal_currencies').select('*').order('name').then(({data,error:e})=>{
      if(!alive)return;
      if(e){setError('Не удалось загрузить валюты: '+e.message);return;}
      const rows=data||[];setCurrencies(rows);
      setCurrencyFrom(v=>rows.some(x=>x.code===v)?v:(rows[0]?.code||''));
      setCurrencyTo(v=>rows.some(x=>x.code===v)?v:(rows[1]?.code||rows[0]?.code||''));
    });
    const channel=supabase.channel('arsenal-currencies').on('postgres_changes',{event:'*',schema:'public',table:'arsenal_currencies'},()=>{
      supabase.from('arsenal_currencies').select('*').order('name').then(({data})=>{if(alive&&data){setCurrencies(data);setCurrencyFrom(v=>data.some(x=>x.code===v)?v:(data[0]?.code||''));setCurrencyTo(v=>data.some(x=>x.code===v)?v:(data[1]?.code||data[0]?.code||''));}});
    }).subscribe();
    return ()=>{alive=false;supabase.removeChannel(channel);};
  },[economyOpen]);

  useEffect(()=>{
    if(!economyOpen)return;
    if(!adminMode && session && profile?.country_code !== economyCountry){
      setError('Доступ к экономике этой страны запрещён.');setEconomyOpen(false);return;
    }
    const empty={country_code:economyCountry,treasury:0,tax_revenue:0,industry_income:0,trade_income:0,exports:0,imports:0,trade_tariffs:0,public_debt:0,unemployment:0,agriculture_output:0,industry_output:0,energy_output:0,construction_output:0,services_output:0,healthcare_expenses:0,education_expenses:0,social_expenses:0,other_expenses:0,trade_partners:'',export_goods:'',import_goods:'',population:0,gdp:0,inflation:0,stability:50,notes:''};
    if(!supabase){setEconomyData(empty);setEconomyDraft(empty);return;}
    if(!session){setEconomyData(null);setEconomyDraft(null);return;}
    let alive=true;setEconomyLoading(true);
    Promise.all([
      supabase.from('country_economy').select('*').eq('country_code',economyCountry).maybeSingle(),
      supabase.from('arsenal_country_display_currencies').select('currency_code').eq('country_code',economyCountry).maybeSingle()
    ]).then(([economyResult,currencyResult])=>{
      if(!alive)return;
      if(economyResult.error){setError('Не удалось загрузить экономику: '+economyResult.error.message);setEconomyData(null);setEconomyDraft(null);}
      else{const value={...empty,...(economyResult.data||{})};setEconomyData(value);setEconomyDraft(value);}
      if(currencyResult.error){setError('Не удалось загрузить валюту страны: '+currencyResult.error.message);setCountryCurrencyCode('');}
      else setCountryCurrencyCode(currencyResult.data?.currency_code||'');
      setEconomyLoading(false);
    });
    const channel=supabase.channel('economy-'+economyCountry).on('postgres_changes',{event:'*',schema:'public',table:'country_economy',filter:`country_code=eq.${economyCountry}`},payload=>{
      if(!alive)return;
      if(payload.eventType==='DELETE'){setEconomyData(empty);setEconomyDraft(empty);}
      else{const value={...empty,...payload.new};setEconomyData(value);setEconomyDraft(value);}
    }).subscribe();
    return ()=>{alive=false;supabase.removeChannel(channel);};
  },[economyOpen,economyCountry,session,adminMode,profile?.country_code]);

  useEffect(()=>{
    if(!session || !supabase) return;
    let alive=true;
    supabase.from('map_state_ownership').select('state_id,state_name,country_code').then(({data,error:e})=>{
      if(!alive)return;
      if(e){setError('Не удалось загрузить владельцев территорий. Выполните SQL-миграцию карты: '+e.message);return;}
      if(data){const next={};data.forEach(row=>{next[row.state_id]=row.country_code;});setMapOwnership(next);}
    });
    const loadCells=async()=>{
      const {data,error:cellError}=await supabase.from('map_cell_ownership').select('cell_id,country_code');
      if(!alive)return;
      if(cellError){setError('Не удалось загрузить границы государств. Выполните миграцию map-cell-ownership.sql: '+cellError.message);return;}
      const next={};(data||[]).forEach(row=>{next[row.cell_id]=row.country_code;});setMapCellOwnership(next);
    };
    loadCells();
    supabase.from('map_country_colors').select('country_code,color').then(({data,error:colorError})=>{
      if(!alive)return;
      if(colorError){setError('Не удалось загрузить цвета государств. Выполните SQL-миграцию map-country-colors.sql: '+colorError.message);return;}
      const next={};(data||[]).forEach(row=>{next[row.country_code]=row.color;});setMapCountryColors(next);
    });
    const channel=supabase.channel('live-map-ownership')
      .on('postgres_changes',{event:'*',schema:'public',table:'map_state_ownership'},payload=>{
        setMapOwnership(prev=>{const next={...prev};if(payload.eventType==='DELETE')delete next[payload.old.state_id];else next[payload.new.state_id]=payload.new.country_code;return next;});
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'map_cell_ownership'},payload=>{
        setMapCellOwnership(prev=>{const next={...prev};if(payload.eventType==='DELETE')delete next[payload.old.cell_id];else next[payload.new.cell_id]=payload.new.country_code;return next;});
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'map_country_colors'},payload=>{
        setMapCountryColors(prev=>{const next={...prev};if(payload.eventType==='DELETE')delete next[payload.old.country_code];else next[payload.new.country_code]=payload.new.color;return next;});
      }).subscribe();
    return ()=>{alive=false;supabase.removeChannel(channel);};
  },[session]);

  const branchNodes=useMemo(()=>nodes.filter(n=>(!n.country_code||n.country_code===countryCode) && n.branch_id===branch && (n.title.toLowerCase().includes(query.toLowerCase())||n.description?.toLowerCase().includes(query.toLowerCase()))),[nodes,branch,query,countryCode]);
  const mySelections=allSelections.filter(s=>s.user_id===session?.user?.id && !['cancelled','rejected'].includes(s.status));
  // Лимит относится только к заявкам, которые всё ещё ожидают решения админа.
  // Подтверждённые, отклонённые и отменённые фокусы в счётчик не входят.
  const pendingSelections=allSelections.filter(s=>s.user_id===session?.user?.id && s.status==='selected');
  const pendingCount=demo ? selected.size : pendingSelections.length;
  const adminCompletedIds=new Set(nodes.filter(n=>n.admin_completed===true).map(n=>n.id));
  const completedIds=new Set([...selected,...adminCompletedIds]);
  const selectedCount=nodes.filter(n=>n.country_code===countryCode&&completedIds.has(n.id)).length;

  useEffect(()=>{
    if(!supabase || login) return;
    let alive=true;
    supabase.rpc('get_available_country_codes').then(({data,error:e})=>{
      if(!alive)return;
      if(e){setError('Не удалось загрузить свободные страны: '+e.message);return;}
      const free=new Set((data||[]).map(x=>typeof x==='string'?x:x.country_code));
      setAvailableCountries(countries.filter(c=>free.has(c.code)));
      if(!free.has(countryCode)){const first=countries.find(c=>free.has(c.code));if(first)setCountryCode(first.code);}
    });
    return ()=>{alive=false;};
  },[login, countries]);

  async function loadContent(){
    if(!supabase)return;
    const [news,events,papers]=await Promise.all([
      supabase.from('arsenal_public_posts').select('*').order('created_at',{ascending:false}),
      supabase.from('arsenal_country_events').select('*').order('created_at',{ascending:false}),
      supabase.from('arsenal_newspaper_posts').select('*').order('created_at',{ascending:false})
    ]);
    if(news.error||events.error||papers.error){setContentError([news.error,events.error,papers.error].filter(Boolean).map(x=>x.message).join(' · '));return;}
    setPublicPosts(news.data||[]);setCountryEvents(events.data||[]);setNewspaperPosts(papers.data||[]);
    if(session?.user?.id){
      const {data:reads,error:readsError}=await supabase.from('arsenal_news_reads').select('section,post_id').eq('user_id',session.user.id);
      if(readsError){setContentError('Не удалось загрузить отметки прочтения. Выполните миграцию arsenal-news-reads.sql: '+readsError.message);}
      else setNewsReadKeys(new Set((reads||[]).map(r=>`${r.section}:${r.post_id}`)));
    }
  }
  async function markNewsSectionRead(section,posts){
    if(!supabase||!session?.user?.id||!posts?.length)return;
    const unread=posts.filter(post=>!newsReadKeys.has(`${section}:${post.id}`));
    if(!unread.length)return;
    const keys=unread.map(post=>`${section}:${post.id}`);
    setNewsReadKeys(prev=>new Set([...prev,...keys]));
    const rows=unread.map(post=>({user_id:session.user.id,section,post_id:String(post.id)}));
    const {error:e}=await supabase.from('arsenal_news_reads').upsert(rows,{onConflict:'user_id,section,post_id',ignoreDuplicates:true});
    if(e){setNewsReadKeys(prev=>{const next=new Set(prev);keys.forEach(k=>next.delete(k));return next;});setContentError('Не удалось сохранить прочитанные новости: '+e.message);}
  }
  useEffect(()=>{
    if(contentPage==='home') markNewsSectionRead('home',publicPosts);
    if(contentPage==='papers') markNewsSectionRead('papers',newspaperPosts.filter(post=>post.status==='approved'));
    if(contentPage==='events') markNewsSectionRead('events',countryEvents.filter(post=>adminMode||post.country_code===profile?.country_code));
  },[contentPage,publicPosts,newspaperPosts,countryEvents,session,profile?.country_code,adminMode]);
  const unreadHomeCount=publicPosts.filter(post=>!newsReadKeys.has(`home:${post.id}`)).length;
  const unreadPapersCount=newspaperPosts.filter(post=>post.status==='approved'&&!newsReadKeys.has(`papers:${post.id}`)).length;
  const visibleEvents=countryEvents.filter(post=>adminMode||post.country_code===profile?.country_code);
  const unreadEventsCount=visibleEvents.filter(post=>!newsReadKeys.has(`events:${post.id}`)).length;
  async function submitContent(kind){
    if(!supabase||!session){setContentError('Для публикации необходимо войти в аккаунт.');return;}
    if(!contentDraft.title.trim()||!contentDraft.body.trim()){setContentError('Заполните заголовок и текст.');return;}
    setContentBusy(true);setContentError('');
    const table=kind==='news'?'arsenal_public_posts':kind==='event'?'arsenal_country_events':'arsenal_newspaper_posts';
    // У arsenal_public_posts нет country_code: общие новости не привязаны к стране.
    // Поле добавляется только для событий и газет, где оно предусмотрено схемой.
    const payload={title:contentDraft.title.trim(),body:contentDraft.body.trim(),created_by:session.user.id};
    if(kind!=='news')payload.country_code=adminMode?(contentDraft.country_code||countryCode):(profile?.country_code||null);
    if(kind==='paper')payload.status='pending';
    const {data:createdPost,error:e}=await supabase.from(table).insert(payload).select('id').single();
    if(e)setContentError(e.message);
    else{
      setContentDraft({title:'',body:'',country_code:''});
      await loadContent();
      if(kind==='news' && adminMode && createdPost?.id){
        const {error:notifyError}=await supabase.functions.invoke('discord-news-notify',{body:{post_id:createdPost.id}});
        if(notifyError)setContentError('Мировая новость опубликована, но уведомление Discord не отправлено: '+notifyError.message);
      }
    }
    setContentBusy(false);
  }
  async function moderatePaper(id,status){
    const {error:e}=await supabase.from('arsenal_newspaper_posts').update({status,moderated_by:session.user.id,moderated_at:new Date().toISOString()}).eq('id',id);
    if(e)setContentError(e.message);else await loadContent();
  }
  async function deleteContent(table,id){
    const {error:e}=await supabase.from(table).delete().eq('id',id);
    if(e)setContentError(e.message);else await loadContent();
  }
  async function authSubmit(e){
    e.preventDefault(); setBusy(true); setError('');
    if(!supabase){setError('Для входа настройте Supabase. Сейчас доступен демонстрационный режим.');setBusy(false);return;}
    if(!login){
      const {data:freeData,error:freeError}=await supabase.rpc('get_available_country_codes');
      if(freeError){setError(freeError.message);setBusy(false);return;}
      const free=new Set((freeData||[]).map(x=>typeof x==='string'?x:x.country_code));
      if(!free.has(countryCode)){setError('Эта страна уже занята. Выберите другую свободную страну.');setAvailableCountries(countries.filter(c=>free.has(c.code)));setBusy(false);return;}
    }
    const result=login?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password,options:{data:{display_name:email.split('@')[0],country_code:countryCode}}});
    if(result.error)setError(result.error.message);
    setBusy(false);
  }
  async function logout(){if(supabase) await supabase.auth.signOut();setSession(null);setProfile(null);setSelected(new Set());}
  async function toggleFocus(n){
    if(adminMode || selectionBusy)return;
    setError('');
    const existing=allSelections.find(s=>s.user_id===session?.user?.id&&s.focus_id===n.id);
    const alreadyPending=existing?.status==='selected';
    const alreadyApproved=existing&&['approved','in_progress','completed'].includes(existing.status);
    const already=demo?selected.has(n.id):!!alreadyPending;
    if(n.admin_completed===true){setError('Этот фокус уже отмечен администратором как изученный.');return;}
    if(alreadyApproved){setError('Этот фокус уже подтверждён администратором.');return;}
    // Проверяем только новые заявки. Уже подтверждённые фокусы не блокируют новые выборы.
    if(!already && pendingCount>=2){setError('У вас уже есть две заявки на подтверждение. Дождитесь решения администратора или отмените одну заявку. Подтверждённые фокусы лимит не занимают.');return;}
    if(n.country_code && n.country_code!==countryCode){setError('Эта ветка принадлежит другой стране.');return;}
    const prereqs=n.prerequisites||[];
    if(!already && prereqs.some(id=>!completedIds.has(id))){setError('Сначала необходимо открыть все предыдущие фокусы.');return;}
    if(demo){setSelected(prev=>{const next=new Set(prev);already?next.delete(n.id):next.add(n.id);return next;});return;}
    if(!session){setError('Войдите в аккаунт, чтобы сохранять исследования.');return;}

    setSelectionBusy(true);
    try{
      if(already && existing){
        const {error:e}=await supabase.from('focus_selections').delete().eq('id',existing.id);
        if(e)throw e;
        setAllSelections(prev=>prev.filter(x=>x.id!==existing.id));
        setSelected(prev=>{const next=new Set(prev);next.delete(n.id);return next;});
      }else{
        let result;
        if(existing){
          result=await supabase.from('focus_selections').update({status:'selected',updated_at:new Date().toISOString()}).eq('id',existing.id).select().single();
        }else{
          result=await supabase.from('focus_selections').insert({user_id:session.user.id,focus_id:n.id,status:'selected'}).select().single();
        }
        if(result.error)throw result.error;
        const saved=result.data;
        setAllSelections(prev=>[...prev.filter(x=>x.id!==saved.id),saved]);
        setSelected(prev=>new Set(prev).add(n.id));
      }
    }catch(e){
      setError(`Не удалось отправить фокус на подтверждение: ${e.message||'неизвестная ошибка'}`);
    }finally{
      setSelectionBusy(false);
    }
  }
  async function approveSelection(selectionId){
    const {data,error:e}=await supabase.from('focus_selections').update({status:'approved',updated_at:new Date().toISOString()}).eq('id',selectionId).select().single();
    if(e){setError(e.message);return;}
    // Сразу освобождаем слот заявки в интерфейсе, не ожидая Realtime.
    setAllSelections(prev=>prev.map(x=>x.id===data.id?data:x));
  }
  async function rejectSelection(selectionId){
    const {data,error:e}=await supabase.from('focus_selections').update({status:'rejected',updated_at:new Date().toISOString()}).eq('id',selectionId).select().single();
    if(e){setError(e.message);return;}
    setAllSelections(prev=>prev.map(x=>x.id===data.id?data:x));
  }
  async function saveFocus(e){
    e.preventDefault(); const f=edit; if(!f)return;
    if(!f.country_code){setError('Выберите страну для этого фокуса.');return;}
    const payload={...f,tier:Number.isInteger(Number(f.tier))?Number(f.tier):0,slot:Number.isInteger(Number(f.slot))?Number(f.slot):0,admin_completed:f.admin_completed===true};
    if(demo){setNodes(prev=>prev.some(x=>x.id===f.id)?prev.map(x=>x.id===f.id?payload:x):[...prev,payload]);setEdit(null);return;}
    const {data,error:saveError}=await supabase.from('focuses').upsert(payload).select().single();
    if(saveError){setError(`Не удалось сохранить фокус: ${saveError.message}`);return;}
    setNodes(prev=>prev.some(x=>x.id===data.id)?prev.map(x=>x.id===data.id?data:x):[...prev,data]);
    setEdit(null);
    if(activeNode?.id===data.id)setActiveNode(data);
  }
  async function toggleAdminCompletion(focus){
    if(!adminMode||!focus)return;
    const nextCompleted=focus.admin_completed!==true;
    if(demo){const updated={...focus,admin_completed:nextCompleted};setNodes(prev=>prev.map(n=>n.id===focus.id?updated:n));setActiveNode(updated);return;}
    const {data,error:e}=await supabase.from('focuses').update({admin_completed:nextCompleted}).eq('id',focus.id).select().single();
    if(e){setError(`Не удалось изменить статус изучения фокуса: ${e.message}`);return;}
    setNodes(prev=>prev.map(n=>n.id===data.id?data:n));setActiveNode(data);
  }
  async function deleteFocus(id){
    if(!confirm('Убрать этот фокус из дерева страны? Удаление также удалит связанные заявки игроков.'))return;
    if(demo)setNodes(prev=>prev.filter(n=>n.id!==id));
    else {const {error:e}=await supabase.from('focuses').delete().eq('id',id);if(e)setError(e.message);}
    setActiveNode(null);
  }
  function newFocus(){const tier=0;const sameTier=nodes.filter(n=>n.country_code===countryCode&&n.branch_id===branch&&(n.tier??0)===tier);const slot=sameTier.length?Math.max(...sameTier.map(n=>Number(n.slot)||0))+1:0;setEdit({id:crypto.randomUUID(),country_code:countryCode,branch_id:branch,title:'Новый фокус',description:'Описание исследования',year:eraYear(tier),tier,slot,cost:50,prerequisites:[],is_active:true,admin_completed:false});}
  function copyFocusToSelectedCountry(focus){if(!adminMode||!focus||focus.country_code===countryCode)return;setEdit({...focus,id:crypto.randomUUID(),country_code:countryCode,tier:getFocusTier(focus),prerequisites:[]});setActiveNode(null);}
  async function copyMontesquieuTree(){
    if(!adminMode||countryCode==='HH'||!countries.some(c=>c.code===countryCode))return;
    const targetName=countries.find(c=>c.code===countryCode)?.name||countryCode;
    if(!confirm(`Скопировать всё технологическое дерево страны hhh в страну «${targetName}»? Существующие фокусы этой страны не будут перезаписаны.`))return;
    setCopyingTree(true);setError('');
    try{
      if(demo){setError('Копирование дерева страны hhh доступно только при подключённом Supabase.');return;}
      const {data,error:rpcError}=await supabase.rpc('clone_montesquieu_tree',{target_country_code:countryCode});
      if(rpcError)throw rpcError;
      const {data:countryNodes,error:loadError}=await supabase.from('focuses').select('*').eq('country_code',countryCode).order('year').order('tier').order('slot');
      if(loadError)throw loadError;
      setNodes(prev=>[...prev.filter(n=>n.country_code!==countryCode),...(countryNodes||[])]);
      setError(`Готово: в страну «${targetName}» скопировано фокусов: ${data??(countryNodes||[]).length}.`);
    }catch(e){setError(`Не удалось скопировать дерево страны hhh: ${e.message||'неизвестная ошибка'}`);}
    finally{setCopyingTree(false);}
  }
  async function addCountry(e){
    e.preventDefault();
    if(!adminMode||!supabase){setError('Управление странами доступно администратору при подключённом Supabase.');return;}
    const code=countryDraftCode.trim().toUpperCase();
    const name=countryDraftName.trim();
    if(!/^[A-Z0-9]{2,8}$/.test(code)){setError('Код страны должен содержать от 2 до 8 латинских букв или цифр.');return;}
    if(!name){setError('Введите название страны.');return;}
    setCountryBusy(true);setError('');
    const {data,error:saveError}=await supabase.from('countries').insert({code,name,is_active:true}).select('code,name').single();
    if(saveError){setError('Не удалось добавить страну: '+saveError.message);setCountryBusy(false);return;}
    setCountries(prev=>[...prev,data].sort((a,b)=>a.name.localeCompare(b.name,'ru')));
    setAvailableCountries(prev=>[...prev,data].sort((a,b)=>a.name.localeCompare(b.name,'ru')));
    setCountryCode(data.code);setCountryDraftCode('');setCountryDraftName('');setCountryBusy(false);
  }
  async function removeCountry(country){
    if(!adminMode||!supabase)return;
    if(!confirm(`Удалить страну «${country.name}» и все её технологические фокусы? Игроков, закреплённых за страной, сначала нужно переназначить.`))return;
    setCountryBusy(true);setError('');
    const {error:deleteError}=await supabase.rpc('admin_delete_country',{target_code:country.code});
    if(deleteError){setError('Не удалось удалить страну: '+deleteError.message);setCountryBusy(false);return;}
    const next=countries.filter(c=>c.code!==country.code);
    setCountries(next);setAvailableCountries(prev=>prev.filter(c=>c.code!==country.code));
    setNodes(prev=>prev.filter(n=>n.country_code!==country.code));
    if(countryCode===country.code){setCountryCode(next[0]?.code||'');setActiveNode(null);}
    setCountryBusy(false);
  }
  async function reassignPlayerCountry(player){
    if(!adminMode||!supabase||!player||player.is_admin)return;
    const targetCode=playerCountryDrafts[player.id]||player.country_code;
    if(!targetCode||targetCode===player.country_code)return;
    const targetCountry=countries.find(c=>c.code===targetCode);
    if(!targetCountry){setError('Выбранная страна не найдена или неактивна.');return;}
    const occupied=players.find(p=>!p.is_admin&&p.id!==player.id&&p.country_code===targetCode);
    if(occupied){setError('Эта страна уже занята другим игроком.');return;}
    if(!confirm(`Переназначить игрока «${player.display_name||player.email||player.id}» из страны «${countries.find(c=>c.code===player.country_code)?.name||player.country_code}» в страну «${targetCountry.name}»? Его заявки и история фокусов сохранятся.`))return;
    setReassigningPlayerId(player.id);setError('');
    try{
      const {error:rpcError}=await supabase.rpc('admin_reassign_player_country',{
        target_user_id:player.id,
        target_country_code:targetCode
      });
      if(rpcError)throw rpcError;
      setPlayers(prev=>prev.map(p=>p.id===player.id?{...p,country_code:targetCode}:p));
      setPlayerCountryDrafts(prev=>({...prev,[player.id]:targetCode}));
    }catch(e){
      setError(`Не удалось переназначить игрока: ${e.message||'неизвестная ошибка'}`);
    }finally{
      setReassigningPlayerId(null);
    }
  }

  async function saveMapCountryColor(){
    if(!adminMode || !mapPaintCountry || mapColorSaving)return;
    setMapColorSaving(true);setError('');
    try{
      if(supabase){
        const {error:e}=await supabase.from('map_country_colors').upsert(
          {country_code:mapPaintCountry,color:mapColorDraft,updated_by:session?.user?.id||null},
          {onConflict:'country_code'}
        );
        if(e)throw e;
      }
      setMapCountryColors(prev=>({...prev,[mapPaintCountry]:mapColorDraft}));
    }catch(e){setError('Не удалось сохранить цвет государства: '+(e.message||'неизвестная ошибка'));}
    finally{setMapColorSaving(false);}
  }

  async function saveMapOwner(){
    if(!activeMapState || !adminMode || mapSaving)return;
    const stateId=activeMapState.id;
    const nextCode=mapOwnerDraft;
    setMapSaving(true);setError('');
    try{
      if(supabase){
        if(nextCode){
          const {error:e}=await supabase.from('map_state_ownership').upsert({state_id:stateId,state_name:activeMapState.name,country_code:nextCode,updated_by:session?.user?.id||null},{onConflict:'state_id'});
          if(e)throw e;
        }else{
          const {error:e}=await supabase.from('map_state_ownership').delete().eq('state_id',stateId);
          if(e)throw e;
        }
      }
      setMapOwnership(prev=>{const next={...prev};if(nextCode)next[stateId]=nextCode;else delete next[stateId];return next;});
    }catch(e){setError('Не удалось изменить владельца территории: '+(e.message||'неизвестная ошибка'));}
    finally{setMapSaving(false);}
  }

  async function saveMapCell(cell){
    if(!adminMode || !mapEditMode || !cell || mapSaving)return;
    const cellId=cell.id, code=mapPaintCountry;
    setMapSaving(true);setError('');
    try{
      if(supabase){
        {
          const {error:e}=await supabase.from('map_cell_ownership').upsert(
            {cell_id:cellId,country_code:code||null,updated_by:session?.user?.id||null},
            {onConflict:'cell_id'}
          );
          if(e)throw e;
        }
      }
      setMapCellOwnership(prev=>{const next={...prev};next[cellId]=code||null;return next;});
    }catch(e){setError('Не удалось изменить границу: '+(e.message||'неизвестная ошибка'));}
    finally{setMapSaving(false);}
  }

  async function saveEconomy(){
    if(!economyDraft||economySaving)return;
    if(!adminMode || (!demo && !session)){setError('Изменять экономические показатели может только администратор.');return;}
    setEconomySaving(true);setError('');
    const payload={...economyDraft,country_code:economyCountry,updated_by:session?.user?.id||null,updated_at:new Date().toISOString()};
    try{
      if(supabase){const {data,error:e}=await supabase.from('country_economy').upsert(payload,{onConflict:'country_code'}).select().single();if(e)throw e;setEconomyData(data);setEconomyDraft(data);}
      else{setEconomyData(payload);setEconomyDraft(payload);}
    }catch(e){setError('Не удалось сохранить экономику: '+(e.message||'неизвестная ошибка'));}
    finally{setEconomySaving(false);}
  }
  function updateEconomyField(field,value){if(!adminMode)return;setEconomyDraft(prev=>({...prev,[field]:value===''?'':Number(value)}));}

  async function addCurrency(e){
    e.preventDefault();if(!adminMode||currencyBusy)return;
    const payload={code:currencyNew.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,''),name:currencyNew.name.trim(),symbol:currencyNew.symbol.trim(),gold_value:Number(currencyNew.gold_value)};
    if(!payload.code||!payload.name||!Number.isFinite(payload.gold_value)||payload.gold_value<=0){setError('Укажи код, название и положительную стоимость валюты в золоте.');return;}
    setCurrencyBusy(true);setError('');
    try{if(supabase){const {data,error:e}=await supabase.from('arsenal_currencies').insert(payload).select().single();if(e)throw e;setCurrencies(prev=>[...prev,{...data}].sort((a,b)=>a.name.localeCompare(b.name)));if(!countryCurrencyCode)setCountryCurrencyCode(data.code);}else{setCurrencies(prev=>[...prev,{...payload,id:payload.code}]);if(!countryCurrencyCode)setCountryCurrencyCode(payload.code);}setCurrencyNew({code:'',name:'',symbol:'',gold_value:'1'});}
    catch(e){setError('Не удалось создать валюту: '+(e.message||'ошибка'));}finally{setCurrencyBusy(false);}
  }
  async function saveCurrency(currency){
    if(!adminMode||currencyBusy)return;setCurrencyBusy(true);setError('');
    try{const payload={name:currency.name,symbol:currency.symbol,gold_value:Number(currency.gold_value)};if(!Number.isFinite(payload.gold_value)||payload.gold_value<=0)throw new Error('Стоимость в золоте должна быть больше нуля.');
      if(supabase){const {data,error:e}=await supabase.from('arsenal_currencies').update(payload).eq('code',currency.code).select().single();if(e)throw e;setCurrencies(prev=>prev.map(x=>x.code===currency.code?data:x));}
      else setCurrencies(prev=>prev.map(x=>x.code===currency.code?{...x,...payload}:x));
    }catch(e){setError('Не удалось сохранить валюту: '+(e.message||'ошибка'));}finally{setCurrencyBusy(false);}
  }
  async function deleteCurrency(currency){
    if(!adminMode||currencyBusy)return;if(!window.confirm(`Удалить валюту «${currency.name}»?`))return;setCurrencyBusy(true);setError('');
    try{if(supabase){const {error:e}=await supabase.from('arsenal_currencies').delete().eq('code',currency.code);if(e)throw e;}setCurrencies(prev=>prev.filter(x=>x.code!==currency.code));if(currencyFrom===currency.code)setCurrencyFrom('');if(currencyTo===currency.code)setCurrencyTo('');}
    catch(e){setError('Не удалось удалить валюту: '+(e.message||'ошибка'));}finally{setCurrencyBusy(false);}
  }
  function updateCurrencyDraft(code,field,value){setCurrencies(prev=>prev.map(x=>x.code===code?{...x,[field]:field==='gold_value'?(value===''?'':Number(value)):value}:x));}
  const displayCurrency=currencies.find(x=>x.code===countryCurrencyCode)||currencies[0]||null;
  const goldToDisplayRate=displayCurrency?1/Number(displayCurrency.gold_value):1;
  function formatEconomyMoney(value){const n=Number(value||0)*goldToDisplayRate;return `${n.toLocaleString('ru-RU',{maximumFractionDigits:2})}${displayCurrency?` ${displayCurrency.symbol||displayCurrency.code}`:' зол.'}`;}
  function economyInputValue(value){return adminMode?value??0:(Number(value||0)*goldToDisplayRate);}
  async function setCountryDisplayCurrency(code){if(!adminMode||currencyBusy)return;setCurrencyBusy(true);setError('');try{if(supabase){const {error:e}=await supabase.from('arsenal_country_display_currencies').upsert({country_code:economyCountry,currency_code:code,updated_by:session?.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'country_code'});if(e)throw e;}setCountryCurrencyCode(code);}catch(e){setError('Не удалось назначить валюту стране: '+(e.message||'ошибка'));}finally{setCurrencyBusy(false);}}
  const currencyResult=(()=>{const from=currencies.find(x=>x.code===currencyFrom),to=currencies.find(x=>x.code===currencyTo);const amount=Number(currencyAmount);if(!from||!to||!Number.isFinite(amount)||amount<0||Number(to.gold_value)<=0)return null;return amount*Number(from.gold_value)/Number(to.gold_value);})();

  function mapCountryColorFallback(code){
    if(!code)return '#626b61';
    let hash=2166136261;
    for(let i=0;i<code.length;i++)hash=Math.imul(hash^code.charCodeAt(i),16777619);
    const hue=(hash>>>0)%360;
    const h=hue/60,c=0.46,x=c*(1-Math.abs(h%2-1)),m=0.43-c/2;
    const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
  }
  function mapCountryColor(code){
    if(!code)return '#626b61';
    if(mapCountryColors[code])return mapCountryColors[code];
    let hash=2166136261;
    for(let i=0;i<code.length;i++)hash=Math.imul(hash^code.charCodeAt(i),16777619);
    const hue=(hash>>>0)%360;
    return `hsl(${hue} 46% 43%)`;
  }
  useEffect(()=>{
    setMapColorDraft(mapCountryColors[mapPaintCountry]||mapCountryColorFallback(mapPaintCountry));
  },[mapPaintCountry,mapCountryColors]);
  const mapCountryLabels=useMemo(()=>{
    const groups={};
    mapData.cells.forEach(cell=>{
      const code=Object.prototype.hasOwnProperty.call(mapCellOwnership,cell.id)?mapCellOwnership[cell.id]:mapOwnership[cell.state];
      if(!code)return;
      const g=groups[code]||(groups[code]={x:0,y:0,n:0});
      g.x+=cell.x;g.y+=cell.y;g.n++;
    });
    return Object.entries(groups).map(([code,g])=>({code,x:g.x/g.n,y:g.y/g.n,count:g.n,
      name:countries.find(c=>c.code===code)?.name||code}));
  },[mapCellOwnership,mapOwnership,countries]);
  // Строим только линии между ячейками, принадлежащими разным игровым странам.
  // Внутренние линии сетки и границы исходных регионов не отображаются.
  const mapCountryBorders=useMemo(()=>{
    const edges=new Map();
    const pointKey=(x,y)=>`${Math.round(x*10)/10},${Math.round(y*10)/10}`;
    mapData.cells.forEach(cell=>{
      const code=Object.prototype.hasOwnProperty.call(mapCellOwnership,cell.id)?mapCellOwnership[cell.id]:mapOwnership[cell.state];
      // Назначенная территория образует единое игровое государство.
      // Если владелец ещё не назначен, сохраняем границы исходного государства Azgaar.
      // Благодаря этому пустые/нераспределённые государства тоже имеют видимый контур.
      const territoryKey=code?`country:${code}`:`unassigned-state:${cell.state}`;
      const points=[...cell.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m=>[Number(m[1]),Number(m[2])]);
      if(points.length<3)return;
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        const ka=pointKey(a[0],a[1]),kb=pointKey(b[0],b[1]);
        const key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
        const edge=edges.get(key)||{a,b,territories:new Set()};
        edge.territories.add(territoryKey);edges.set(key,edge);
      }
    });
    const segments=[];
    // Рисуем только линии между разными государственными территориями.
    // Внутренние линии ячеек/регионов остаются невидимыми.
    edges.forEach(edge=>{if(edge.territories.size>1)segments.push(`M${edge.a[0]},${edge.a[1]}L${edge.b[0]},${edge.b[1]}`);});
    return segments.join(' ');
  },[mapCellOwnership,mapOwnership]);

  const Icon=BRANCHES.find(b=>b.id===branch)?.icon||Shield;

  if(!session && !demo) return <div className="auth-page"><div className="auth-card"><div className="brand-mark"><Shield/></div><p className="eyebrow">ВОЕННО-ПОЛИТИЧЕСКАЯ СИМУЛЯЦИЯ</p><h1>АРСЕНАЛ</h1><p className="muted">Технологическое древо · 1850—1990</p><form onSubmit={authSubmit}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label> {!login&&<label>Свободная страна<select value={countryCode} onChange={e=>setCountryCode(e.target.value)} required disabled={!availableCountries.length}>{availableCountries.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select>{!availableCountries.length&&<small className="error">Свободных стран не осталось</small>}</label>}<label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6"/></label><button className="primary full" disabled={busy}>{busy?'Подождите…':login?'Войти':'Создать аккаунт'}</button></form><button className="link-btn" onClick={()=>setLogin(!login)}>{login?'Нет аккаунта? Зарегистрироваться':'Уже есть аккаунт? Войти'}</button>{error&&<p className="error">{error}</p>}</div></div>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Shield size={21}/></div><div><strong>АРСЕНАЛ</strong><small>ТЕХНОЛОГИЧЕСКОЕ ДРЕВО</small></div></div>
      <div className="top-meta"><span className="live-dot"></span>{demo?'ДЕМО-РЕЖИМ':'СИНХРОНИЗАЦИЯ АКТИВНА'}<span className="divider-v"></span><span>{countries.find(c=>c.code===countryCode)?.name||'Страна не выбрана'} · 1850 — 1990</span></div>
      <div className="top-actions"><button className={"secondary nav-with-unread "+(contentPage==='home'?'active':'')} onClick={()=>{setContentPage('home');setMapOpen(false);}}>Главная{unreadHomeCount>0&&<span className="nav-unread" aria-label={`${unreadHomeCount} непрочитанных новостей`}>{unreadHomeCount>99?'99+':unreadHomeCount}</span>}</button><button className={"secondary nav-with-unread "+(contentPage==='events'?'active':'')} onClick={()=>{setContentPage('events');setMapOpen(false);}}>Ивенты и квесты{unreadEventsCount>0&&<span className="nav-unread" aria-label={`${unreadEventsCount} непрочитанных событий`}>{unreadEventsCount>99?'99+':unreadEventsCount}</span>}</button><button className={"secondary nav-with-unread "+(contentPage==='papers'?'active':'')} onClick={()=>{setContentPage('papers');setMapOpen(false);}}>Новости стран{unreadPapersCount>0&&<span className="nav-unread" aria-label={`${unreadPapersCount} непрочитанных новостей`}>{unreadPapersCount>99?'99+':unreadPapersCount}</span>}</button><button className={"secondary "+(contentPage==='tree'?'active':'')} onClick={()=>{setContentPage('tree');setMapOpen(false);}}>Технологии</button>{(demo||(session&&profile?.country_code)||adminMode)&&<button className="secondary" onClick={()=>{setEconomyCountry(adminMode?countryCode:(profile?.country_code||countryCode));setEconomyOpen(true);}}><Coins size={15}/> Экономика</button>}<button className={"secondary "+(mapOpen?"active":"")} onClick={()=>{setMapOpen(v=>!v);setActiveMapState(null);}}><Globe size={15}/> {mapOpen?"К технологическому древу":"Карта мира"}</button>{adminMode&&<button className="secondary" onClick={()=>setShowAdmin(!showAdmin)}><Users size={15}/> Панель управления</button>}{!demo&&<button className="icon-btn" title="Выйти" onClick={logout}><LogOut size={17}/></button>}</div>
    </header>
    {demo&&<div className="demo-banner">Демонстрационный режим: изменения сохраняются только в этом браузере. Подключите Supabase, чтобы включить общую базу и синхронизацию игроков.</div>}
    {!mapOpen&&contentPage!=='tree'&&<main className="content-hub">
      <div className="page-heading"><div><p className="eyebrow">АРСЕНАЛ / ИНФОРМАЦИОННЫЙ ЦЕНТР</p><h1>{contentPage==='home'?'Новости и сводки войн':contentPage==='events'?'Ивенты и квесты':'Газеты стран'}</h1><p className="muted">{contentPage==='home'?'Общая оперативная картина для всех государств':contentPage==='events'?'События и задания вашей страны':'Национальная пресса и публикации игроков'}</p></div></div>
      {contentError&&<div className="toast">{contentError}</div>}
      {contentPage==='home'&&<><section className="content-compose"><h3>Официальные новости и сводки</h3>{adminMode?<><input placeholder="Заголовок новости" value={contentDraft.title} onChange={e=>setContentDraft({...contentDraft,title:e.target.value})}/><MarkdownEditor placeholder="Текст новости или сводки войны" rows={6} value={contentDraft.body} onChange={body=>setContentDraft({...contentDraft,body})}/><button className="primary" disabled={contentBusy} onClick={()=>submitContent('news')}>Опубликовать для всех</button></>:<p className="muted">Новости и сводки публикует администрация. Они доступны всем игрокам.</p>}</section>{publicPosts.map(p=><article className="content-article" key={p.id}><small>{new Date(p.created_at).toLocaleString('ru-RU')} · ОБЩАЯ СВОДКА</small><h2>{p.title}</h2><MarkdownContent text={p.body}/>{adminMode&&<button className="danger" onClick={()=>deleteContent('arsenal_public_posts',p.id)}>Удалить</button>}</article>)}</>}
      {contentPage==='events'&&<>{adminMode&&<section className="content-compose"><h3>Новое событие / квест</h3><select value={contentDraft.country_code||countryCode} onChange={e=>setContentDraft({...contentDraft,country_code:e.target.value})}>{countries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select><input placeholder="Название события" value={contentDraft.title} onChange={e=>setContentDraft({...contentDraft,title:e.target.value})}/><MarkdownEditor rows={6} placeholder="Описание и условия" value={contentDraft.body} onChange={body=>setContentDraft({...contentDraft,body})}/><button className="primary" disabled={contentBusy} onClick={()=>submitContent('event')}>Создать событие</button></section>}{visibleEvents.map(p=><article className="content-article" key={p.id}><small>{countries.find(c=>c.code===p.country_code)?.name||p.country_code} · {new Date(p.created_at).toLocaleString('ru-RU')}</small><h2>{p.title}</h2><MarkdownContent text={p.body}/>{adminMode&&<button className="danger" onClick={()=>deleteContent('arsenal_country_events',p.id)}>Удалить</button>}</article>)}{!adminMode&&!countryEvents.some(p=>p.country_code===profile?.country_code)&&<p className="muted">Для вашей страны пока нет активных ивентов и квестов.</p>}</>}
      {contentPage==='papers'&&<><section className="content-compose"><h3>Предложить новость для газеты</h3><p className="muted">Публикация появится в газете после проверки администратором.</p><input placeholder="Заголовок" value={contentDraft.title} onChange={e=>setContentDraft({...contentDraft,title:e.target.value})}/><MarkdownEditor rows={6} placeholder="Текст новости" value={contentDraft.body} onChange={body=>setContentDraft({...contentDraft,body})}/><button className="primary" disabled={contentBusy||!profile?.country_code} onClick={()=>submitContent('paper')}>Отправить на модерацию</button></section>{adminMode&&<section className="content-compose"><h3>Ожидают проверки</h3>{newspaperPosts.filter(p=>p.status==='pending').map(p=><article className="content-article" key={p.id}><small>{countries.find(c=>c.code===p.country_code)?.name||p.country_code}</small><h2>{p.title}</h2><MarkdownContent text={p.body}/><button className="primary" onClick={()=>moderatePaper(p.id,'approved')}>Одобрить</button> <button className="danger" onClick={()=>moderatePaper(p.id,'rejected')}>Отклонить</button></article>)}</section>}{newspaperPosts.filter(p=>p.status==='approved').map(p=><article className="content-article" key={p.id}><small>{countries.find(c=>c.code===p.country_code)?.name||p.country_code} · ГАЗЕТА</small><h2>{p.title}</h2><MarkdownContent text={p.body}/></article>)}{newspaperPosts.filter(p=>p.created_by===session?.user?.id&&p.status==='pending').map(p=><article className="content-article pending" key={p.id}><small>ВАША НОВОСТЬ · ОЖИДАЕТ ПРОВЕРКИ</small><h2>{p.title}</h2><MarkdownContent text={p.body}/></article>)}</>}
    </main>}
    {!mapOpen&&contentPage==='tree'&&<div className="layout">
      <aside className="sidebar"><div className="side-label">СТРАНА</div><select className="country-select" value={countryCode} disabled={!adminMode && !!session} onChange={e=>{if(adminMode)setCountryCode(e.target.value);}}>{countries.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select>{adminMode&&<p className="admin-country-hint">Выберите страну, чтобы управлять её фокусами</p>}<div className="side-label">НАПРАВЛЕНИЯ ИССЛЕДОВАНИЙ</div>{BRANCHES.map(b=><button key={b.id} className={`branch-btn ${branch===b.id?'active':''}`} onClick={()=>{setBranch(b.id);setActiveNode(null);setQuery('')}}><b.icon size={18} style={{color:b.color}}/><span>{b.name}<small>{nodes.filter(n=>n.country_code===countryCode&&n.branch_id===b.id).length} фокусов</small></span><span className="branch-arrow">›</span></button>)}<div className="sidebar-bottom"><div className="progress-label"><span>ОТКРЫТО ФОКУСОВ</span><b>{selectedCount}/{nodes.filter(n=>n.country_code===countryCode).length}</b></div><div className="progress-track"><div style={{width:`${Math.min(100,selectedCount/6)}%`}}/></div><p>Ваш технологический прогресс</p><p className="pending-counter">Заявки на подтверждение: <b>{pendingCount}/2</b></p></div></aside>
      <main className="main">
        <div className="page-heading"><div><p className="eyebrow">ДОКТРИНА / ИССЛЕДОВАНИЯ</p><h1><Icon size={26}/> {BRANCHES.find(b=>b.id===branch)?.name}</h1><p className="muted">{BRANCHES.find(b=>b.id===branch)?.desc}</p></div><div className="heading-stats"><div><b>{nodes.filter(n=>n.country_code===countryCode&&n.branch_id===branch).length}</b><small>ФОКУСОВ</small></div><div><b>{nodes.filter(n=>n.country_code===countryCode&&n.branch_id===branch&&(completedIds.has(n.id))).length}</b><small>ОТКРЫТО</small></div></div></div>
        <div className="toolbar"><div className="searchbox"><Search size={16}/><input placeholder="Поиск по исследованиям…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="legend"><span><i className="dot pending"/> Ожидает подтверждения</span><span><i className="dot done"/> Подтверждено</span><span><i className="dot ready"/> Доступно</span><span><i className="dot locked"/> Заблокировано</span></div>{adminMode&&<>{countryCode!=='HH'&&<button className="secondary" onClick={copyMontesquieuTree} disabled={copyingTree}>{copyingTree?'Копирование…':'Скопировать дерево страны hhh'}</button>}<button className="primary" onClick={newFocus}><Plus size={16}/> Добавить фокус</button></>}</div>
        
        <div className="tree-scroll"><div className="tree-grid">{Array.from({length:10},(_,tier)=><section className="tier-column" key={tier}><div className="tier-heading"><span>ЭТАП {String(tier+1).padStart(2,'0')}</span><b>{eraYear(tier)} г.</b></div>{branchNodes.filter(n=>getFocusTier(n)===tier).map(n=>{
          const selection=allSelections.find(x=>x.user_id===session?.user?.id&&x.focus_id===n.id);
          const pending=demo?selected.has(n.id):selection?.status==='selected';
          const approved=!demo&&['approved','in_progress','completed'].includes(selection?.status);
          const adminCompleted=n.admin_completed===true;
          const done=adminCompleted||pending||approved, prereqs=n.prerequisites||[], unlocked=adminMode||prereqs.length===0||prereqs.every(id=>completedIds.has(id));
          return <button key={n.id} className={`focus-card ${(adminCompleted||approved)?'done':pending?'pending':unlocked?'ready':'locked'} ${activeNode?.id===n.id?'focused':''} ${adminCompleted?'admin-completed':''}`} onClick={()=>setActiveNode(n)}><span className="focus-state">{done?<Check size={13}/>:unlocked?<Unlock size={12}/>:<Lock size={12}/>}</span><strong>{n.title}</strong>{adminCompleted&&<span className="admin-completed-label">✓ ИЗУЧЕН АДМИНИСТРАТОРОМ</span>}<span className="focus-meta"><span>{n.year} г.</span><span>{n.cost} ОН</span></span></button>
        })}</section>)}</div></div>
        <div className="bottom-note"><span><Clock3 size={14}/> Исследования проходят последовательно по технологическим этапам.</span><span>ОН — очки науки, настраиваются администратором</span></div>
      </main>
    </div>}
    {mapOpen&&<section className="world-map-page ars-world-map">
      <div className="ars-world-map-header">
        <div><p className="eyebrow">АРСЕНАЛ / ГЕОПОЛИТИЧЕСКАЯ ОБСТАНОВКА</p><h1>Карта мира — {mapData.mapName}</h1>
          <p className="muted">Территории, государственные границы и политическое распределение мира.</p></div>
        <div className="ars-map-controls">
          <button className="secondary" onClick={()=>setMapZoom(z=>Math.min(3,z+0.25))}><ZoomIn size={15}/> Увеличить</button>
          <button className="secondary" onClick={()=>setMapZoom(z=>Math.max(0.75,z-0.25))}><ZoomOut size={15}/> Уменьшить</button>
          <button className="secondary" onClick={()=>setMapZoom(1)}>Сбросить</button>
        </div>
      </div>
      {adminMode&&<div className="ars-map-editor-bar">
        <div className="ars-map-editor-title"><span className="ars-map-live-dot"/> ИНСТРУМЕНТЫ АДМИНИСТРАТОРА</div>
        <button className={mapEditMode?'primary':'secondary'} onClick={()=>setMapEditMode(v=>!v)}>{mapEditMode?'Завершить редактирование':'Редактировать границы'}</button>
        {mapEditMode&&<>
          <label>Государство для закрашивания
            <select value={mapPaintCountry} onChange={e=>setMapPaintCountry(e.target.value)}>
              <option value="">Снять принадлежность</option>{countries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="ars-map-color-control">Цвет выбранного государства
            <span><input type="color" value={mapColorDraft} disabled={!mapPaintCountry} onChange={e=>setMapColorDraft(e.target.value)} /> <code>{mapColorDraft.toUpperCase()}</code></span>
          </label>
          <button className="secondary" type="button" onClick={saveMapCountryColor} disabled={!mapPaintCountry||mapColorSaving||mapColorDraft===mapCountryColor(mapPaintCountry)}>{mapColorSaving?'Сохранение…':'Сохранить цвет'}</button>
          <span className="ars-map-editor-hint">Нажимайте на ячейки карты, чтобы передавать их выбранному государству.</span>
        </>}
      </div>}
      <div className="ars-map-workspace">
        <div className={`ars-map-board ${mapEditMode?'is-editing':''}`}>
          <svg viewBox={`0 0 ${mapData.width} ${mapData.height}`} preserveAspectRatio="xMidYMid meet"
            style={{width:'100%',height:'100%',display:'block',transform:`scale(${mapZoom})`,transformOrigin:'center center'}}>
            {mapData.cells.map(cell=>{
              const code=Object.prototype.hasOwnProperty.call(mapCellOwnership,cell.id)?mapCellOwnership[cell.id]:mapOwnership[cell.state];
              const selectedState=activeMapState?.id===cell.state;
              return <path key={cell.id} d={cell.d} fill={mapCountryColor(code)}
                fillOpacity={code?0.9:0.34} stroke="none"
                style={{cursor:mapEditMode?'crosshair':'pointer'}}
                onClick={()=>{if(mapEditMode){saveMapCell(cell);return;}const st=mapData.states.find(s=>s.id===cell.state);if(st){setActiveMapState(st);setMapOwnerDraft(mapOwnership[st.id]||'');}}}>
                <title>{mapData.states.find(s=>s.id===cell.state)?.name||'Нейтральная территория'} · Ячейка {cell.id}{code?' — '+(countries.find(c=>c.code===code)?.name||code):' — не распределено'}</title>
              </path>;
            })}
            {mapCountryBorders&&<path d={mapCountryBorders} className="ars-map-national-borders" fill="none" pointerEvents="none"/>}
            {mapCountryLabels.map(label=><g key={label.code} pointerEvents="none">
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle"
                className="ars-map-country-label" fontSize={Math.max(12,Math.min(24,11+Math.sqrt(label.count)*0.8))}>
                {label.name.length>30?label.name.slice(0,28)+'…':label.name}
              </text>
            </g>)}
          </svg>
          <div className="ars-map-board-caption">АЗУИА · 6 936 ЯЧЕЕК · {countries.length} ИГРОВЫХ ГОСУДАРСТВ</div>
        </div>
        <aside className="ars-map-inspector">
          {mapEditMode?<><p className="eyebrow">РЕЖИМ КАРТОГРАФА</p><h2>Изменение границ</h2>
            <p className="muted">Выбрано государство:</p>
            <div className="ars-map-active-country"><i style={{background:mapCountryColor(mapPaintCountry)}}/>{countries.find(c=>c.code===mapPaintCountry)?.name||'Нейтральная территория'}</div>
            <p className="ars-map-instruction">Кликните по любой ячейке на карте. Она немедленно перейдёт выбранному государству. Повторное назначение другой страны изменит границу между ними.</p>
            <div className="ars-map-legend"><b>Палитра государств</b>{countries.map(c=><div key={c.code}><i style={{background:mapCountryColor(c.code)}}/><span>{c.name}</span></div>)}</div>
          </>:activeMapState?<><p className="eyebrow">ВЫБРАННАЯ ТЕРРИТОРИЯ</p><h2>{activeMapState.name}</h2>
            <div className="ars-map-data-row"><span>Индекс Azgaar</span><b>{activeMapState.id}</b></div>
            <div className="ars-map-data-row"><span>Ячеек исходной территории</span><b>{activeMapState.cells}</b></div>
            <div className="ars-map-data-row"><span>Игровой владелец</span><b>{countries.find(c=>c.code===mapOwnership[activeMapState.id])?.name||'Не назначен'}</b></div>
            {adminMode?<><label className="ars-map-field">Назначить владельца всей исходной территории<select value={mapOwnerDraft} onChange={e=>setMapOwnerDraft(e.target.value)}><option value="">Не распределено</option>{countries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
              <button className="primary full" disabled={mapSaving||mapOwnerDraft===(mapOwnership[activeMapState.id]||'')} onClick={saveMapOwner}><Save size={15}/>{mapSaving?'Сохранение…':'Назначить всю территорию'}</button>
              <p className="ars-map-small-note">Для изменения отдельных участков включите режим «Редактировать границы».</p></>:<p className="ars-map-small-note">Изменять государственные границы может только администратор.</p>}
          </>:<><p className="eyebrow">ГЕОПОЛИТИЧЕСКАЯ СВОДКА</p><h2>Карта государств</h2>
            <p className="muted">Нажмите на территорию, чтобы увидеть её исходное государство. Подписи на карте показывают игровые страны, которым принадлежат территории.</p>
            <div className="ars-map-legend"><b>Государства и цвета</b>{countries.map(c=><div key={c.code}><i style={{background:mapCountryColor(c.code)}}/><span>{c.name}</span></div>)}</div>
          </>}
        </aside>
      </div>
      {error&&<p className="ars-map-error">{error}</p>}
    </section>}
    {economyOpen&&<div className="modal-backdrop economy-backdrop" onClick={()=>setEconomyOpen(false)}><div className="admin-modal economy-modal" onClick={e=>e.stopPropagation()}>
      <button className="close-btn" onClick={()=>setEconomyOpen(false)} aria-label="Закрыть"><X/></button>
      <div className="economy-heading"><div><p className="eyebrow">ГОСУДАРСТВЕННОЕ УПРАВЛЕНИЕ · ФИНАНСЫ</p><h2>Экономический обзор</h2><p className="economy-subtitle">Финансовое положение и ключевые показатели государства</p></div><span className="economy-seal"><Coins size={25}/></span></div>
      {adminMode&&<label className="economy-country-picker">Управление государством<select value={economyCountry} onChange={e=>setEconomyCountry(e.target.value)}>{countries.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select></label>}
      <div className="economy-country-line"><span className="economy-country-name">{countries.find(c=>c.code===economyCountry)?.name||economyCountry}</span><span className={`economy-access ${adminMode?'is-admin':'is-viewer'}`}>{adminMode?'АДМИНИСТРАТОР':'ПРОСМОТР'}</span></div>
      {economyLoading?<div className="economy-loading">Загрузка экономических показателей…</div>:economyDraft&&<>
        <section className="economy-hero-grid">
          <div className="economy-treasury">
            <span className="economy-kicker">ГОСУДАРСТВЕННАЯ КАЗНА</span>
            <strong>{formatEconomyMoney(economyDraft.treasury)}</strong>
            <small>Денежные резервы государства</small>
            <div className="economy-analog-meter treasury-meter" aria-label="Шкала объёма казны">
              <div className="meter-track"><i style={{width:`${Math.max(2,Math.min(100,(Number(economyDraft.treasury||0)/(Math.max(1,Number(economyDraft.treasury||0),Number(economyDraft.gdp||0))))*100))}%`}}/></div>
              <div className="meter-ticks"><span>МИН.</span><span>РЕЗЕРВЫ</span><span>МАКС.</span></div>
            </div>
            <span className="economy-hero-mark"><Coins size={34}/></span>
          </div>
          <div className="economy-balance">
            <span className="economy-kicker">БАЛАНС ЗА ПЕРИОД</span>
            <strong className={((Number(economyDraft.tax_revenue||0)+Number(economyDraft.industry_income||0)+Number(economyDraft.trade_income||0)+Number(economyDraft.trade_tariffs||0)-Number(economyDraft.military_expenses||0)-Number(economyDraft.administration_expenses||0)-Number(economyDraft.infrastructure_expenses||0)-Number(economyDraft.healthcare_expenses||0)-Number(economyDraft.education_expenses||0)-Number(economyDraft.social_expenses||0)-Number(economyDraft.other_expenses||0)))>=0?'positive':'negative'}>{formatEconomyMoney(Number(economyDraft.tax_revenue||0)+Number(economyDraft.industry_income||0)+Number(economyDraft.trade_income||0)+Number(economyDraft.trade_tariffs||0)-Number(economyDraft.military_expenses||0)-Number(economyDraft.administration_expenses||0)-Number(economyDraft.infrastructure_expenses||0)-Number(economyDraft.healthcare_expenses||0)-Number(economyDraft.education_expenses||0)-Number(economyDraft.social_expenses||0)-Number(economyDraft.other_expenses||0))}</strong>
            <small>Доходы за вычетом расходов</small>
            <div className="economy-analog-meter balance-meter"><div className="meter-track"><i style={{width:`${Math.max(2,Math.min(100,Math.abs((Number(economyDraft.tax_revenue||0)+Number(economyDraft.industry_income||0)+Number(economyDraft.trade_income||0)+Number(economyDraft.trade_tariffs||0)-Number(economyDraft.military_expenses||0)-Number(economyDraft.administration_expenses||0)-Number(economyDraft.infrastructure_expenses||0)-Number(economyDraft.healthcare_expenses||0)-Number(economyDraft.education_expenses||0)-Number(economyDraft.social_expenses||0)-Number(economyDraft.other_expenses||0)))/(Math.max(1,Number(economyDraft.tax_revenue||0)+Number(economyDraft.industry_income||0)+Number(economyDraft.trade_income||0),Number(economyDraft.military_expenses||0)+Number(economyDraft.administration_expenses||0)+Number(economyDraft.infrastructure_expenses||0)))*100))}%`}}/></div><div className="meter-ticks"><span>ДЕФИЦИТ</span><span>БАЛАНС</span><span>ПРОФИЦИТ</span></div></div>
            <span className="economy-balance-symbol">↗</span>
          </div>
        </section>
        <section className="economy-indicators">
          <div className="economy-gauge"><span>НАСЕЛЕНИЕ</span><b>{Number(economyDraft.population||0).toLocaleString('ru-RU')}</b><small>человек</small><div className="economy-ruler"><i style={{width:`${Math.max(2,Math.min(100,Math.log10(Number(economyDraft.population||0)+1)/9*100))}%`}}/></div><em>ШКАЛА МАСШТАБА</em></div>
          <div className="economy-gauge"><span>ВВП</span><b>{formatEconomyMoney(economyDraft.gdp)}</b><small>объём экономики</small><div className="economy-ruler"><i style={{width:`${Math.max(2,Math.min(100,Math.log10(Number(economyDraft.gdp||0)+1)/12*100))}%`}}/></div><em>ШКАЛА МАСШТАБА</em></div>
          <div className="economy-gauge"><span>ВВП НА ДУШУ</span><b>{formatEconomyMoney(Number(economyDraft.population||0)>0?Number(economyDraft.gdp||0)/Number(economyDraft.population):0)}</b><small>{displayCurrency?.name||'золота'} на человека</small><div className="economy-ruler"><i style={{width:`${Math.max(2,Math.min(100,Math.log10((Number(economyDraft.population||0)>0?Number(economyDraft.gdp||0)/Number(economyDraft.population):0)+1)/7*100))}%`}}/></div><em>ВВП ÷ НАСЕЛЕНИЕ</em></div>
          <div className="economy-gauge"><span>ИНФЛЯЦИЯ</span><b>{Number(economyDraft.inflation||0).toLocaleString('ru-RU')}%</b><small>текущий уровень</small><div className="economy-ruler inflation-ruler"><i style={{width:`${Math.max(2,Math.min(100,Number(economyDraft.inflation||0)/20*100))}%`}}/></div><em>0 — 20%</em></div>
          <div className="economy-gauge economy-stability"><span>СТАБИЛЬНОСТЬ</span><b>{Number(economyDraft.stability||0)}<small> / 100</small></b><div className="economy-ruler"><i style={{width:`${Math.max(0,Math.min(100,Number(economyDraft.stability)||0))}%`}}/></div><em>ГОСУДАРСТВЕННЫЙ ИНДЕКС</em></div>
        </section>
        <div className="economy-section-title"><h3>Финансовые потоки</h3><span>ЗА ПЕРИОД</span></div>
        <div className="economy-ledgers">
          <section className="economy-ledger income"><h4><span>＋</span> Доходы</h4><div className="economy-fields">{[['tax_revenue','Налоговые поступления'],['industry_income','Промышленность'],['trade_income','Торговля'],['trade_tariffs','Таможенные пошлины']].map(([key,label])=><label className="economy-flow-row" key={key}><span className="flow-label">{label}</span><div className="flow-scale"><i style={{width:`${Math.max(1,Math.min(100,Number(economyDraft[key]||0)/(Math.max(1,Number(economyDraft.tax_revenue||0),Number(economyDraft.industry_income||0),Number(economyDraft.trade_income||0),Number(economyDraft.military_expenses||0),Number(economyDraft.administration_expenses||0),Number(economyDraft.infrastructure_expenses||0)))*100))}%`}}/></div><div className="economy-input-wrap"><input type="number" value={economyInputValue(economyDraft[key])} readOnly={!adminMode} onChange={e=>updateEconomyField(key,e.target.value)}/><small>{displayCurrency?.symbol||displayCurrency?.code||'Au'}</small></div></label>)}</div></section>
          <section className="economy-ledger expenses"><h4><span>−</span> Расходы</h4><div className="economy-fields">{[['military_expenses','Военные расходы'],['administration_expenses','Государственный аппарат'],['infrastructure_expenses','Инфраструктура'],['healthcare_expenses','Здравоохранение'],['education_expenses','Образование'],['social_expenses','Социальные выплаты'],['other_expenses','Прочие расходы']].map(([key,label])=><label className="economy-flow-row" key={key}><span className="flow-label">{label}</span><div className="flow-scale"><i style={{width:`${Math.max(1,Math.min(100,Number(economyDraft[key]||0)/(Math.max(1,Number(economyDraft.tax_revenue||0),Number(economyDraft.industry_income||0),Number(economyDraft.trade_income||0),Number(economyDraft.military_expenses||0),Number(economyDraft.administration_expenses||0),Number(economyDraft.infrastructure_expenses||0)))*100))}%`}}/></div><div className="economy-input-wrap"><input type="number" value={economyInputValue(economyDraft[key])} readOnly={!adminMode} onChange={e=>updateEconomyField(key,e.target.value)}/><small>{displayCurrency?.symbol||displayCurrency?.code||'Au'}</small></div></label>)}</div></section>
        </div>
        <div className="economy-section-title"><h3>Внешняя торговля</h3><span>МЕЖДУНАРОДНЫЙ ОБМЕН</span></div>
        <section className="economy-trade-grid">
          <div className="economy-data-card"><span className="economy-kicker">ЭКСПОРТ</span><strong>{formatEconomyMoney(economyDraft.exports)}</strong><small>Стоимость вывезенных товаров и услуг</small><label>Объём экспорта<input type="number" min="0" value={economyInputValue(economyDraft.exports)} readOnly={!adminMode} onChange={e=>updateEconomyField('exports',e.target.value)}/></label></div>
          <div className="economy-data-card"><span className="economy-kicker">ИМПОРТ</span><strong>{formatEconomyMoney(economyDraft.imports)}</strong><small>Стоимость ввезённых товаров и услуг</small><label>Объём импорта<input type="number" min="0" value={economyInputValue(economyDraft.imports)} readOnly={!adminMode} onChange={e=>updateEconomyField('imports',e.target.value)}/></label></div>
          <div className="economy-data-card"><span className="economy-kicker">ТОРГОВЫЙ БАЛАНС</span><strong className={Number(economyDraft.exports||0)-Number(economyDraft.imports||0)>=0?'positive':'negative'}>{formatEconomyMoney(Number(economyDraft.exports||0)-Number(economyDraft.imports||0))}</strong><small>{Number(economyDraft.exports||0)>=Number(economyDraft.imports||0)?'Положительное сальдо — профицит':'Отрицательное сальдо — дефицит'}</small></div>
          <div className="economy-data-card"><span className="economy-kicker">ТАМОЖЕННЫЕ ПОШЛИНЫ</span><strong>{formatEconomyMoney(economyDraft.trade_tariffs)}</strong><small>Поступления в государственный бюджет</small></div>
        </section>
        <div className="economy-fields economy-trade-details">
          <label>Основные торговые партнёры<textarea rows="3" value={economyDraft.trade_partners||''} readOnly={!adminMode} onChange={e=>setEconomyDraft(prev=>({...prev,trade_partners:e.target.value}))} placeholder="Страны-партнёры, объём и условия торговли"/></label>
          <label>Основные экспортные товары<textarea rows="3" value={economyDraft.export_goods||''} readOnly={!adminMode} onChange={e=>setEconomyDraft(prev=>({...prev,export_goods:e.target.value}))} placeholder="Например: уголь, сталь, зерно"/></label>
          <label>Основные импортные товары<textarea rows="3" value={economyDraft.import_goods||''} readOnly={!adminMode} onChange={e=>setEconomyDraft(prev=>({...prev,import_goods:e.target.value}))} placeholder="Например: нефть, оборудование, медикаменты"/></label>
        </div>
        <div className="economy-section-title"><h3>Отрасли экономики</h3><span>ОБЪЁМ ПРОИЗВОДСТВА</span></div>
        <div className="economy-sector-grid">{[['agriculture_output','Сельское хозяйство'],['industry_output','Промышленность'],['energy_output','Энергетика'],['construction_output','Строительство'],['services_output','Сфера услуг']].map(([key,label])=><label className="economy-sector" key={key}><span>{label}</span><b>{formatEconomyMoney(economyDraft[key])}</b><div className="economy-ruler"><i style={{width:`${Math.max(1,Math.min(100,(Number(economyDraft[key]||0)/Math.max(1,Number(economyDraft.agriculture_output||0),Number(economyDraft.industry_output||0),Number(economyDraft.energy_output||0),Number(economyDraft.construction_output||0),Number(economyDraft.services_output||0)))*100))}%`}}/></div><input type="number" min="0" value={economyInputValue(economyDraft[key])} readOnly={!adminMode} onChange={e=>updateEconomyField(key,e.target.value)}/></label>)}</div>
        <div className="economy-section-title"><h3>Долг и рынок труда</h3><span>ФИНАНСОВАЯ УСТОЙЧИВОСТЬ</span></div>
        <div className="economy-fields economy-parameter-grid">{[['public_debt','Государственный долг'],['unemployment','Безработица (%)']].map(([key,label])=><label key={key}>{label}<input type="number" min="0" value={key==='public_debt'?economyInputValue(economyDraft[key]):(economyDraft[key]??0)} readOnly={!adminMode} onChange={e=>updateEconomyField(key,e.target.value)}/></label>)}</div>
        <div className="economy-section-title"><h3>Валютный рынок</h3><span>КУРСЫ И КОНВЕРТАЦИЯ</span></div>
        <section className="currency-panel">
          <div className="currency-converter">
            <div className="currency-panel-heading"><b>Конвертер валют</b><small>Курсы отображаются относительно выбранной валюты</small></div>
            <div className="currency-converter-grid">
              <label>Сумма<input type="number" min="0" step="any" value={currencyAmount} onChange={e=>setCurrencyAmount(e.target.value)}/></label>
              <label>Из валюты<select value={currencyFrom} onChange={e=>setCurrencyFrom(e.target.value)}>{currencies.map(c=><option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></label>
              <span className="currency-arrow">→</span>
              <label>В валюту<select value={currencyTo} onChange={e=>setCurrencyTo(e.target.value)}>{currencies.map(c=><option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></label>
            </div>
            <div className="currency-result"><small>РЕЗУЛЬТАТ КОНВЕРТАЦИИ</small><strong>{currencyResult===null?'—':currencyResult.toLocaleString('ru-RU',{maximumFractionDigits:6})} {currencies.find(c=>c.code===currencyTo)?.symbol||currencyTo}</strong>
              {currencies.find(c=>c.code===currencyFrom)&&currencies.find(c=>c.code===currencyTo)&&<span>1 {currencyFrom} = {(Number(currencies.find(c=>c.code===currencyFrom).gold_value)/Number(currencies.find(c=>c.code===currencyTo).gold_value)).toLocaleString('ru-RU',{maximumFractionDigits:8})} {currencyTo}</span>}
            </div>
          </div>
          <div className="currency-rates"><div className="currency-panel-heading"><b>Справочник валют</b><small>Базовая оценка: золото</small></div>{adminMode&&<label className="currency-display-choice">Валюта отображения для {countries.find(c=>c.code===economyCountry)?.name||economyCountry}<select value={countryCurrencyCode||currencies[0]?.code||''} onChange={e=>setCountryDisplayCurrency(e.target.value)} disabled={currencyBusy||!currencies.length}>{currencies.map(c=><option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></label>}
            {currencies.length?currencies.map(c=><div className="currency-rate-row" key={c.code}><span className="currency-symbol">{c.symbol||'¤'}</span><div className="currency-rate-info"><b>{c.name}</b><small>{c.code} · 1 единица = {Number(c.gold_value).toLocaleString('ru-RU')} золота</small></div>{adminMode?<><label className="currency-gold-input">Золото за 1 ед.<input type="number" min="0.000001" step="any" value={c.gold_value} onChange={e=>updateCurrencyDraft(c.code,'gold_value',e.target.value)}/></label><button className="secondary currency-action" disabled={currencyBusy} onClick={()=>saveCurrency(c)}><Save size={13}/> Сохранить</button><button className="danger currency-action" disabled={currencyBusy} onClick={()=>deleteCurrency(c)}><Trash2 size={13}/></button></>:null}</div>):<p className="muted tiny">Валюты ещё не добавлены администратором.</p>}
          </div>
          {adminMode&&<form className="currency-create" onSubmit={addCurrency}><b>Добавить валюту</b><div className="currency-create-grid"><label>Код<input value={currencyNew.code} onChange={e=>setCurrencyNew(v=>({...v,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')}))} maxLength="8" placeholder="Например, CRN" required/></label><label>Название<input value={currencyNew.name} onChange={e=>setCurrencyNew(v=>({...v,name:e.target.value}))} placeholder="Королевская крона" required/></label><label>Символ<input value={currencyNew.symbol} onChange={e=>setCurrencyNew(v=>({...v,symbol:e.target.value}))} maxLength="8" placeholder="₡"/></label><label>Золота за 1 единицу<input type="number" min="0.000001" step="any" value={currencyNew.gold_value} onChange={e=>setCurrencyNew(v=>({...v,gold_value:e.target.value}))} required/></label><button className="primary" disabled={currencyBusy}><Plus size={14}/> Создать валюту</button></div></form>}
          <p className="currency-note">Курс между двумя валютами рассчитывается автоматически через их стоимость в золоте. Например: курс A к B = стоимость A в золоте ÷ стоимость B в золоте.</p>
        </section>
        <div className="economy-section-title"><h3>Параметры государства</h3><span>ОСНОВНЫЕ ДАННЫЕ</span></div>
        <div className="economy-fields economy-parameter-grid">{[['treasury','Казна'],['population','Население'],['gdp','ВВП'],['inflation','Инфляция (%)'],['stability','Стабильность (0–100)']].map(([key,label])=><label key={key}>{label}<input type="number" min={key==='stability'?0:undefined} max={key==='stability'?100:undefined} value={['treasury','gdp'].includes(key)?economyInputValue(economyDraft[key]):(economyDraft[key]??0)} readOnly={!adminMode} onChange={e=>updateEconomyField(key,e.target.value)}/></label>)}</div>
        <label className="economy-notes-label">Государственные примечания<textarea rows="3" value={economyDraft.notes||''} readOnly={!adminMode} onChange={e=>adminMode&&setEconomyDraft(prev=>({...prev,notes:e.target.value}))} placeholder="Экономические события, долги, санкции…"/></label>
        {adminMode&&<button className="primary full economy-save" onClick={saveEconomy} disabled={economySaving}><Save size={16}/>{economySaving?'Сохранение…':'Сохранить изменения'}</button>}
        <p className="economy-footnote">{displayCurrency?`Денежные показатели ${countries.find(c=>c.code===economyCountry)?.name||economyCountry} показываются в ${displayCurrency.name} (${displayCurrency.code}). Администратор вводит и сохраняет суммы в стандартном золоте.`:'Денежные показатели пока отображаются в золоте.'} <Lock size={13}/>{adminMode?'Редактирование доступно только администратору.':'Режим просмотра: показатели вашей страны доступны только для чтения.'} Защита изменений также обеспечивается на уровне базы данных.</p>
      </>}
    </div></div>}
    {activeNode&&<div className="drawer-backdrop" onClick={()=>setActiveNode(null)}><aside className="detail-drawer" onClick={e=>e.stopPropagation()}><button className="close-btn" onClick={()=>setActiveNode(null)}><X/></button><p className="eyebrow">ТЕХНОЛОГИЧЕСКИЙ ФОКУС</p><h2>{activeNode.title}</h2><div className="detail-tags"><span>{activeNode.year} год</span><span>{activeNode.cost} очков науки</span></div><p className="detail-desc">{activeNode.description}</p>{activeNode.admin_completed===true&&<p className="admin-completed-notice">✓ Этот фокус отмечен администратором как изученный для вашей страны</p>}<div className="detail-section"><small>ПРЕДПОСЫЛКИ</small>{(activeNode.prerequisites||[]).length?(activeNode.prerequisites||[]).map(id=><p key={id}>{nodes.find(n=>n.id===id)?.title||id}</p>):<p>Нет обязательных предпосылок</p>}</div>{adminMode?<div className="drawer-actions"><button className="primary" onClick={()=>setEdit(activeNode)}><Pencil size={15}/> Редактировать / переназначить</button><button className="secondary" onClick={()=>toggleAdminCompletion(activeNode)}>{activeNode.admin_completed===true?<Unlock size={15}/>:<Check size={15}/>} {activeNode.admin_completed===true?'Снять отметку «Изучен»':'Отметить как изученный'}</button>{activeNode.country_code!==countryCode&&<button className="secondary" onClick={()=>copyFocusToSelectedCountry(activeNode)}><Plus size={15}/> Копировать в {countries.find(c=>c.code===countryCode)?.name||countryCode}</button>}<button className="danger" onClick={()=>deleteFocus(activeNode.id)}><Trash2 size={15}/> Убрать</button></div>:(()=>{const own=allSelections.find(x=>x.user_id===session?.user?.id&&x.focus_id===activeNode.id);const approved=!demo&&['approved','in_progress','completed'].includes(own?.status);const adminCompleted=activeNode.admin_completed===true;const pending=demo?selected.has(activeNode.id):own?.status==='selected';return <button className={`primary full ${(approved||adminCompleted)?'selected-button':''}`} disabled={adminCompleted||approved||selectionBusy} onClick={()=>toggleFocus(activeNode)}>{adminCompleted?'Изучено (назначено администратором)':approved?'Подтверждено администратором':selectionBusy?'Сохранение…':pending?'Отменить заявку':'Отправить на подтверждение'}</button>;})()}</aside></div>}
    {showAdmin&&adminMode&&<div className="modal-backdrop"><div className="admin-modal"><button className="close-btn" onClick={()=>setShowAdmin(false)}><X/></button><p className="eyebrow">АДМИНИСТРИРОВАНИЕ</p><h2>Обзор кампании</h2><div className="admin-stats"><div><b>{players.length}</b><small>УЧАСТНИКОВ</small></div><div><b>{allSelections.length}</b><small>ВЫБРАНО ФОКУСОВ</small></div><div><b>{nodes.length}</b><small>ВСЕГО ФОКУСОВ</small></div></div><h3>Управление странами</h3><form className="country-manager-form" onSubmit={addCountry}><label>Название страны<input value={countryDraftName} onChange={e=>setCountryDraftName(e.target.value)} placeholder="Например, Республика Аркадия" required/></label><label>Код<input value={countryDraftCode} onChange={e=>setCountryDraftCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="ARK" minLength="2" maxLength="8" required/></label><button className="primary" disabled={countryBusy}><Plus size={15}/> Добавить страну</button></form><div className="country-admin-list">{countries.map(c=><div className="country-admin-row" key={c.code}><span><b>{c.name}</b><small>{c.code} · {nodes.filter(n=>n.country_code===c.code).length} фокусов · {players.filter(p=>p.country_code===c.code).length} игроков</small>{players.some(p=>p.country_code===c.code&&!p.is_admin)&&<small className="country-in-use">Есть закреплённый игрок — сначала переназначьте его</small>}</span><button className="danger" disabled={countryBusy||players.some(p=>p.country_code===c.code&&!p.is_admin)} onClick={()=>removeCountry(c)}><Trash2 size={14}/> Удалить</button></div>)}</div><h3>Переназначение игроков</h3><div className="selection-list">{players.filter(p=>!p.is_admin).map(player=>{const currentCode=player.country_code||'';const draftCode=playerCountryDrafts[player.id]||currentCode;const availableTargets=countries.filter(c=>c.code===currentCode||!players.some(other=>!other.is_admin&&other.id!==player.id&&other.country_code===c.code));return <div className="selection-row" key={`player-${player.id}`}><span>{player.display_name||player.email||player.id.slice(0,8)}<small className="country-label">{player.email||'Почта не указана'}</small></span><select value={draftCode} onChange={e=>setPlayerCountryDrafts(prev=>({...prev,[player.id]:e.target.value}))} disabled={reassigningPlayerId===player.id}>{availableTargets.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select><button className="primary" disabled={!draftCode||draftCode===currentCode||reassigningPlayerId===player.id} onClick={()=>reassignPlayerCountry(player)}>{reassigningPlayerId===player.id?'Перенос…':'Переназначить'}</button></div>})}{!players.some(p=>!p.is_admin)&&<p className="muted tiny">Пока нет обычных игроков для переназначения.</p>}</div><h3>Выборы игроков</h3><div className="selection-list">{allSelections.filter(s=>!['cancelled','rejected'].includes(s.status)).map(s=>{const player=players.find(p=>p.id===s.user_id);const focus=nodes.find(n=>n.id===s.focus_id);return <div className="selection-row" key={s.id}><span>{player?.display_name||player?.email||s.user_id.slice(0,8)}<small className="country-label">{countries.find(c=>c.code===player?.country_code)?.name||player?.country_code||'Страна не указана'}</small></span><b>{focus?.title||s.focus_id}</b><small>{s.status==='selected'?'Ожидает подтверждения':s.status==='approved'?'Подтверждён':s.status}</small>{s.status==='selected'&&<span className="approval-actions"><button className="primary" onClick={()=>approveSelection(s.id)}>Подтвердить</button><button className="danger" onClick={()=>rejectSelection(s.id)}>Отклонить</button></span>}</div>})}</div><p className="muted tiny">Статус «Ожидает подтверждения» означает, что выбор ещё не одобрен администратором. Данные синхронизируются автоматически.</p></div></div>}
    {edit&&<div className="modal-backdrop"><form className="edit-modal" onSubmit={saveFocus}><button type="button" className="close-btn" onClick={()=>setEdit(null)}><X/></button><p className="eyebrow">РЕДАКТОР ФОКУСА</p><h2>{nodes.some(n=>n.id===edit.id)?'Изменить фокус':'Новый фокус'}</h2><label>Страна, которой доступен фокус<select value={edit.country_code||countryCode} onChange={e=>setEdit({...edit,country_code:e.target.value})}>{countries.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select></label><label>Название<input value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})} required/></label><label>Описание<textarea rows="4" value={edit.description||''} onChange={e=>setEdit({...edit,description:e.target.value})}/></label><div className="form-row"><label>Этап<select value={Number.isInteger(edit.tier)?edit.tier:0} onChange={e=>{const tier=Number(e.target.value);setEdit({...edit,tier,year:eraYear(tier)});}}>{Array.from({length:10},(_,tier)=><option value={tier} key={tier}>Этап {String(tier+1).padStart(2,'0')}</option>)}</select></label><label>Год<input type="number" min="1850" max="1990" value={edit.year} onChange={e=>{const year=+e.target.value;setEdit({...edit,year,tier:Math.max(0,Math.min(9,Math.round((year-1850)*9/140)))});}}/></label></div><div className="form-row"><label>Позиция в этапе<input type="number" min="0" value={edit.slot??0} onChange={e=>setEdit({...edit,slot:Math.max(0,+e.target.value)})}/></label><label>Стоимость (ОН)<input type="number" min="0" value={edit.cost} onChange={e=>setEdit({...edit,cost:+e.target.value})}/></label></div><label>Ветка<select value={edit.branch_id} onChange={e=>setEdit({...edit,branch_id:e.target.value})}>{BRANCHES.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label><label>Предпосылки (ID фокусов через запятую)<input value={(edit.prerequisites||[]).join(', ')} onChange={e=>setEdit({...edit,prerequisites:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label><button className="primary full"><Save size={16}/> Сохранить изменения</button></form></div>}
    {error&&<div className="toast" onClick={()=>setError('')}>{error}<X size={14}/></div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
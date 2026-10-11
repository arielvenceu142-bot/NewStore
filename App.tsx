import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured, money, type Product, type StoreSettings } from './lib/supabase'
import { Zap, Search, ShoppingCart, UserRound, LogOut, ShieldCheck, Headset, Gamepad2, Smartphone, Clapperboard, X, Package, Plus, Trash2, RefreshCw, MessageCircle, Star } from 'lucide-react'

const defaults: StoreSettings = { store_name: 'NewStore', primary_color: '#8b5cf6', secondary_color: '#2563eb', promo_banner: 'Seu universo digital em um só lugar ⚡' }
const fallbackProducts: Product[] = [
  { id: 'demo-1', name: 'Gift Card Google Play', description: 'Créditos para apps, jogos e conteúdo digital.', category: 'Gift Cards', price_cents: 2500, image_url: null, stock: 50, active: true },
  { id: 'demo-2', name: 'Recarga Free Fire', description: 'Diamantes para sua conta. Confira a região antes de comprar.', category: 'Games', price_cents: 1000, image_url: null, stock: 50, active: true },
  { id: 'demo-3', name: 'Gift Card Netflix', description: 'Cartão pré-pago de entretenimento, conforme disponibilidade regional.', category: 'Streaming', price_cents: 3500, image_url: null, stock: 20, active: true },
  { id: 'demo-4', name: 'Créditos para jogos', description: 'Produtos digitais para diversos jogos e plataformas.', category: 'Games', price_cents: 1500, image_url: null, stock: 30, active: true }
]
type Profile = { id: string; email?: string; display_name?: string | null; role: 'customer' | 'admin'; banned_at?: string | null }

export default function App() {
  const [products, setProducts] = useState<Product[]>(fallbackProducts)
  const [settings, setSettings] = useState<StoreSettings>(defaults)
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [modal, setModal] = useState<'login' | 'signup' | 'admin' | 'support' | 'cart' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [notice, setNotice] = useState('')
  const [cart, setCart] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [adminTab, setAdminTab] = useState('products')
  const [newProduct, setNewProduct] = useState({ name: '', description: '', category: 'Gift Cards', price: '10,00', image_url: '', stock: '10' })
  const [customers, setCustomers] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [supportText, setSupportText] = useState('')
  const [supportReply, setSupportReply] = useState('')
  const [rating, setRating] = useState(5)

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: auth } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setProfile(null) })
    loadStore()
    const channel = supabase.channel('newstore-public-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadProducts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, () => loadSettings())
      .subscribe()
    return () => { auth.subscription.unsubscribe(); supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { if (session?.user) loadProfile() }, [session])
  useEffect(() => { if (profile?.role === 'admin' && modal === 'admin') loadAdminData() }, [profile, modal, adminTab])

  async function loadStore() { await Promise.all([loadProducts(), loadSettings()]) }
  async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*').eq('active', true).order('created_at', { ascending: false })
    if (!error && data) setProducts(data as Product[])
  }
  async function loadSettings() {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
    if (data) setSettings(data as StoreSettings)
  }
  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('id,display_name,role,banned_at').eq('id', session.user.id).maybeSingle()
    if (data) {
      setProfile({ ...data, email: session.user.email })
      if (data.banned_at) { await supabase.auth.signOut(); setNotice('Esta conta está bloqueada. Entre em contato com o suporte.'); return }
    } else setProfile({ id: session.user.id, email: session.user.email, role: 'customer' })
  }
  async function loadAdminData() {
    const [p, o, r, c] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id,status,total_cents,created_at,user_id').order('created_at', { ascending: false }).limit(100),
      supabase.from('support_reviews').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id,display_name,role,banned_at,created_at').order('created_at', { ascending: false }).limit(100)
    ])
    if (p.data) setProducts(p.data as Product[])
    if (o.data) setOrders(o.data)
    if (r.data) setReviews(r.data)
    if (c.data) setCustomers(c.data)
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false); setNotice(error ? error.message : 'Login realizado.')
    if (!error) setModal(null)
  }
  async function signUp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setNotice('')
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
    setLoading(false)
    setNotice(error ? error.message : 'Cadastro enviado! Confirme o e-mail, caso a confirmação esteja habilitada.')
    if (!error) setModal(null)
  }
  async function addProduct(e: React.FormEvent) {
    e.preventDefault()
    const cents = Math.round(Number(newProduct.price.replace(/\./g, '').replace(',', '.')) * 100)
    if (!newProduct.name.trim() || !Number.isFinite(cents) || cents < 0) { setNotice('Confira nome e preço.'); return }
    const { error } = await supabase.from('products').insert({ name: newProduct.name, description: newProduct.description, category: newProduct.category, price_cents: cents, image_url: newProduct.image_url || null, stock: Number(newProduct.stock), active: true })
    setNotice(error ? error.message : 'Produto cadastrado.')
    if (!error) { setNewProduct({ name: '', description: '', category: 'Gift Cards', price: '10,00', image_url: '', stock: '10' }); loadAdminData() }
  }
  async function deleteProduct(id: string) {
    if (!confirm('Excluir este produto?')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    setNotice(error ? error.message : 'Produto excluído. Clientes conectados recebem a atualização em tempo real.')
    loadAdminData()
  }
  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const update = { store_name: String(fd.get('store_name')), primary_color: String(fd.get('primary_color')), secondary_color: String(fd.get('secondary_color')), promo_banner: String(fd.get('promo_banner')) }
    const { error } = await supabase.from('store_settings').update(update).eq('id', 1)
    setNotice(error ? error.message : 'Configurações salvas.')
    if (!error) loadSettings()
  }
  async function changeRole(id: string, role: string) {
    const { error } = await supabase.functions.invoke('admin-user-action', { body: { user_id: id, action: 'set_role', role } })
    setNotice(error ? error.message : 'Cargo atualizado.'); loadAdminData()
  }
  async function banUser(id: string, banned: boolean) {
    const { error } = await supabase.functions.invoke('admin-user-action', { body: { user_id: id, action: banned ? 'ban' : 'unban' } })
    setNotice(error ? error.message : 'Status do cliente atualizado.'); loadAdminData()
  }
  async function createCheckout(product: Product) {
    if (!session) { setModal('login'); setNotice('Entre na conta para continuar.'); return }
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { product_id: product.id, quantity: 1 } })
    setLoading(false)
    if (error || !data?.init_point) { setNotice(error?.message || 'Pagamento não configurado ou indisponível.'); return }
    window.location.href = data.init_point
  }
  async function askSupport(e: React.FormEvent) {
    e.preventDefault()
    if (!session) { setNotice('Entre na conta para usar o suporte.'); setModal('login'); return }
    setLoading(true); setSupportReply('')
    const { data, error } = await supabase.functions.invoke('support-ai', { body: { message: supportText } })
    setLoading(false)
    setSupportReply(error ? 'O suporte com IA ainda não está configurado. Tente novamente mais tarde ou abra um chamado pelo painel.' : data?.reply || 'Não consegui responder agora.')
  }

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.filter(p => p.active).map(p => p.category)))], [products])
  const shown = products.filter(p => p.active && (category === 'Todos' || p.category === category) && `${p.name} ${p.description || ''}`.toLowerCase().includes(query.toLowerCase()))
  const isAdmin = profile?.role === 'admin'
  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + Number(o.total_cents || 0), 0)

  return <div className="app" style={{ '--primary': settings.primary_color || defaults.primary_color, '--secondary': settings.secondary_color || defaults.secondary_color } as React.CSSProperties}>
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon"><Zap size={22}/></span><span>{settings.store_name || 'NewStore'}<small>UNIVERSO DIGITAL</small></span></a>
      <nav><a href="#produtos">Produtos</a><a href="#categorias">Categorias</a><a href="#suporte" onClick={(e) => { e.preventDefault(); setModal('support') }}>Suporte</a></nav>
      <div className="actions"><button className="icon-btn" onClick={() => setModal('cart')} aria-label="Carrinho"><ShoppingCart size={19}/><span className="cart-count">{cart.length}</span></button>
        {session ? <><span className="user-pill"><UserRound size={16}/>{profile?.display_name || session.user.email?.split('@')[0]}</span>{isAdmin && <button className="btn btn-small" onClick={() => setModal('admin')}><ShieldCheck size={16}/> Admin</button>}<button className="icon-btn" onClick={() => supabase.auth.signOut()} title="Sair"><LogOut size={18}/></button></> : <><button className="btn btn-ghost" onClick={() => setModal('login')}>Entrar</button><button className="btn" onClick={() => setModal('signup')}>Criar conta</button></>}
      </div>
    </header>
    {!supabaseConfigured && <div className="setup-alert">Modo de demonstração: configure as variáveis do Supabase em <code>.env</code> para ativar login, banco de dados e pagamentos reais.</div>}
    {settings.promo_banner && <div className="promo"><Zap size={15}/>{settings.promo_banner}</div>}
    <main><section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="pulse"/> SUA LOJA DIGITAL</span><h1>Seu próximo nível<br/>começa <span>aqui.</span></h1><p>Gift cards, recargas e entretenimento digital. Tudo o que você ama, em um só lugar.</p><div className="hero-buttons"><a className="btn" href="#produtos">Explorar produtos <span>↗</span></a><button className="btn btn-ghost" onClick={() => setModal('support')}><Headset size={17}/> Falar com suporte</button></div><div className="trust"><span><ShieldCheck size={17}/> Compra protegida</span><span><Zap size={17}/> Entrega digital</span></div></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-core"><Zap size={70}/></div><div className="float-card card-a"><Gamepad2/><span>GAMES<small>Suba de nível</small></span></div><div className="float-card card-b"><Smartphone/><span>GIFT CARDS<small>Seu saldo, seu jeito</small></span></div><div className="float-card card-c"><Clapperboard/><span>STREAMING<small>Entretenimento</small></span></div></div></section>
      <section className="benefits"><div><ShieldCheck/><span><b>Compra segura</b><small>Proteção de dados</small></span></div><div><Zap/><span><b>Rápido e digital</b><small>Sem complicação</small></span></div><div><Headset/><span><b>Suporte dedicado</b><small>Estamos aqui por você</small></span></div></section>
      <section id="categorias" className="section"><div className="section-heading"><div><span className="eyebrow">EXPLORE A NEWSTORE</span><h2>Escolha sua <span>categoria</span></h2></div></div><div className="category-grid"><button onClick={() => {setCategory('Todos'); document.getElementById('produtos')?.scrollIntoView({behavior:'smooth'})}}><span className="category-icon purple"><Gamepad2/></span><b>Games</b><small>Recargas e moedas</small></button><button onClick={() => {setCategory('Gift Cards'); document.getElementById('produtos')?.scrollIntoView({behavior:'smooth'})}}><span className="category-icon blue"><Smartphone/></span><b>Gift Cards</b><small>Créditos e apps</small></button><button onClick={() => {setCategory('Streaming'); document.getElementById('produtos')?.scrollIntoView({behavior:'smooth'})}}><span className="category-icon pink"><Clapperboard/></span><b>Streaming</b><small>Seu entretenimento</small></button></div></section>
      <section id="produtos" className="section products-section"><div className="section-heading"><div><span className="eyebrow">SELEÇÃO DIGITAL</span><h2>Produtos em <span>destaque</span></h2><p>Encontre o próximo item da sua coleção.</p></div><label className="search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar produto..."/></label></div><div className="filters">{categories.map(c => <button key={c} className={category === c ? 'filter active' : 'filter'} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="product-grid">{shown.map(p => <article className="product-card" key={p.id}><div className="product-image">{p.image_url ? <img src={p.image_url} alt={p.name}/> : <div className="product-placeholder"><Package size={48}/><span>{p.category}</span></div>}<span className="product-tag">{p.category}</span></div><div className="product-info"><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><strong>{money(p.price_cents)}</strong><button className="buy-btn" disabled={loading || p.id.startsWith('demo-')} onClick={() => createCheckout(p)}>{p.id.startsWith('demo-') ? 'Demonstração' : 'Comprar'} <span>↗</span></button></div></div></article>)}</div>
        {shown.length === 0 && <div className="empty"><Package size={32}/><p>Nenhum produto encontrado.</p></div>}
      </section>
      <section className="support-banner" id="suporte"><div className="support-symbol"><Headset size={32}/></div><div><span className="eyebrow">PRECISA DE AJUDA?</span><h2>Estamos aqui por você.</h2><p>Conte com nosso suporte para tirar suas dúvidas.</p></div><button className="btn" onClick={() => setModal('support')}>Abrir suporte <MessageCircle size={17}/></button></section>
    </main>
    <footer><a className="brand" href="#"><span className="brand-icon"><Zap size={20}/></span><span>{settings.store_name || 'NewStore'}<small>UNIVERSO DIGITAL</small></span></a><p>© {new Date().getFullYear()} {settings.store_name || 'NewStore'}. Todos os direitos reservados.</p><span className="footer-status"><i/> Sistema online</span></footer>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><div className={`modal ${modal === 'admin' ? 'modal-wide' : ''}`} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}><X/></button>
      {(modal === 'login' || modal === 'signup') && <><div className="modal-logo"><Zap size={24}/></div><h2>{modal === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h2><p className="muted">{modal === 'login' ? 'Entre para continuar sua experiência.' : 'Cadastre-se para comprar e acompanhar pedidos.'}</p><form className="form" onSubmit={modal === 'login' ? signIn : signUp}>{modal === 'signup' && <label>Nome completo<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Seu nome"/></label>}<label>E-mail<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></label><label>Senha<input required type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"/></label><button className="btn full" disabled={loading}>{loading ? 'Aguarde...' : modal === 'login' ? 'Entrar na conta' : 'Criar conta'}</button></form><p className="switch-modal">{modal === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'} <button onClick={() => setModal(modal === 'login' ? 'signup' : 'login')}>{modal === 'login' ? 'Cadastre-se' : 'Entrar'}</button></p></>}
      {modal === 'cart' && <><h2>Seu carrinho</h2><p className="muted">Confira seus produtos antes de comprar.</p>{cart.length ? <>{cart.map((p,i)=><div className="cart-row" key={i}><span>{p.name}</span><b>{money(p.price_cents)}</b><button onClick={()=>setCart(old=>old.filter((_,j)=>i!==j))}><Trash2 size={16}/></button></div>)}<button className="btn full" onClick={()=>{setModal('login');setNotice('Entre para finalizar a compra de cada produto.')}}>Continuar</button></> : <div className="empty"><ShoppingCart size={30}/><p>Seu carrinho está vazio.</p><button className="btn" onClick={()=>setModal(null)}>Explorar produtos</button></div>}</>}
      {modal === 'support' && <><div className="modal-logo"><Headset size={24}/></div><h2>Suporte NewStore</h2><p className="muted">Descreva sua dúvida. A IA responde quando a integração estiver configurada.</p><form className="form" onSubmit={askSupport}><label>Como podemos ajudar?<textarea required value={supportText} onChange={e=>setSupportText(e.target.value)} placeholder="Escreva sua mensagem..." rows={4}/></label><button className="btn full" disabled={loading}>{loading ? 'Analisando...' : 'Enviar mensagem'}</button></form>{supportReply && <div className="ai-reply"><b><MessageCircle size={16}/> Resposta do suporte</b><p>{supportReply}</p></div>}{session && <form className="form review-form" onSubmit={async e=>{e.preventDefault();const {error}=await supabase.from('support_reviews').insert({user_id:session.user.id,rating,comment:'Avaliação enviada pelo cliente'});setNotice(error?error.message:'Obrigado pela avaliação!');if(!error)setModal(null)}}><label>Como você avalia o atendimento?</label><div className="rating">{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setRating(n)} className={n<=rating?'selected':''}><Star fill={n<=rating?'currentColor':'none'}/></button>)}</div><button className="btn btn-ghost full">Enviar avaliação</button></form>}</>}
      {modal === 'admin' && isAdmin && <><div className="admin-title"><div><span className="eyebrow">CENTRAL DE CONTROLE</span><h2>Painel administrativo</h2></div><span className="admin-badge"><ShieldCheck size={15}/> Admin</span></div><div className="admin-tabs">{[['products','Produtos'],['settings','Aparência'],['customers','Clientes'],['orders','Pedidos'],['reviews','Avaliações'],['dashboard','Dashboard']].map(([id,label])=><button key={id} className={adminTab===id?'selected':''} onClick={()=>setAdminTab(id)}>{label}</button>)}</div>
        {adminTab==='products' && <div className="admin-content"><h3>Adicionar produto</h3><form className="admin-form" onSubmit={addProduct}><input required placeholder="Nome do produto" value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})}/><input placeholder="Descrição" value={newProduct.description} onChange={e=>setNewProduct({...newProduct,description:e.target.value})}/><select value={newProduct.category} onChange={e=>setNewProduct({...newProduct,category:e.target.value})}><option>Gift Cards</option><option>Games</option><option>Streaming</option><option>Aplicativos</option></select><input required placeholder="Preço (ex. 10,00)" value={newProduct.price} onChange={e=>setNewProduct({...newProduct,price:e.target.value})}/><input placeholder="URL da imagem" value={newProduct.image_url} onChange={e=>setNewProduct({...newProduct,image_url:e.target.value})}/><input type="number" min="0" placeholder="Estoque" value={newProduct.stock} onChange={e=>setNewProduct({...newProduct,stock:e.target.value})}/><button className="btn"><Plus size={16}/> Cadastrar produto</button></form><h3>Produtos cadastrados</h3>{products.map(p=><div className="admin-row" key={p.id}><span><b>{p.name}</b><small>{money(p.price_cents)} · {p.active?'Ativo':'Oculto'}</small></span><button className="danger-btn" onClick={()=>deleteProduct(p.id)}><Trash2 size={16}/> Excluir</button></div>)}</div>}
        {adminTab==='settings' && <form className="form admin-content" onSubmit={saveSettings}><h3>Aparência da loja</h3><label>Nome da loja<input name="store_name" defaultValue={settings.store_name}/></label><label>Banner promocional<input name="promo_banner" defaultValue={settings.promo_banner || ''}/></label><div className="color-fields"><label>Cor principal<input name="primary_color" type="color" defaultValue={settings.primary_color}/></label><label>Cor secundária<input name="secondary_color" type="color" defaultValue={settings.secondary_color}/></label></div><button className="btn">Salvar alterações em tempo real</button></form>}
        {adminTab==='customers' && <div className="admin-content"><h3>Clientes e permissões</h3>{customers.map(c=><div className="admin-row" key={c.id}><span><b>{c.display_name || 'Cliente'}</b><small>{c.id.slice(0,8)}… · {c.role}{c.banned_at?' · Bloqueado':''}</small></span><div className="row-actions"><select value={c.role} onChange={e=>changeRole(c.id,e.target.value)}><option value="customer">Cliente</option><option value="admin">Admin</option></select><button className="danger-btn" onClick={()=>banUser(c.id,!c.banned_at)}>{c.banned_at?'Desbanir':'Banir'}</button></div></div>)}</div>}
        {adminTab==='orders' && <div className="admin-content"><h3>Pedidos recentes</h3>{orders.map(o=><div className="admin-row" key={o.id}><span><b>{money(o.total_cents)}</b><small>{o.id.slice(0,8)}… · {new Date(o.created_at).toLocaleString('pt-BR')}</small></span><span className="status">{o.status}</span></div>)}<p className="muted">Reembolsos reais devem ser processados no Mercado Pago e sincronizados pelo webhook validado.</p></div>}
        {adminTab==='reviews' && <div className="admin-content"><h3>Avaliações do suporte</h3>{reviews.map(r=><div className="admin-row" key={r.id}><span><b>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</b><small>{r.comment || 'Sem comentário'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</small></span></div>)}</div>}
        {adminTab==='dashboard' && <div className="stats-grid"><div><small>Pedidos carregados</small><b>{orders.length}</b></div><div><small>Receita paga</small><b>{money(totalRevenue)}</b></div><div><small>Clientes listados</small><b>{customers.length}</b></div><div><small>Avaliações</small><b>{reviews.length}</b></div></div>}
      </>}
    </div></div>}
  </div>
}
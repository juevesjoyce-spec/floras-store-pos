// src/App.jsx - Flora's Store POS with Firebase sync integrated
import React, { useEffect, useState } from 'react'
import './index.css'
import { db } from './firebase'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'

const ENABLE_FIREBASE = true

const PRODUCTS_KEY = 'flora_react_products_v2'
const CATEGORIES_KEY = 'flora_react_categories_v2'
const SALES_KEY = 'flora_react_sales_v2'
const OUTBOX_KEY = 'flora_react_outbox_v2'
const SETTINGS_KEY = 'flora_react_settings_v2'

const uid = (p='id') => p + '_' + Date.now() + '_' + Math.floor(Math.random()*1000)
const fmt = n => '₱' + Number(n||0).toFixed(2)

export default function App(){ 
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [sales, setSales] = useState([])
  const [outbox, setOutbox] = useState([])
  const [settings, setSettings] = useState({ contact:'0999-999-9999', cashier:'Joyce', thankMsg:'Thank you 💗', receiptSize:'58', mode:'auto' })
  const [activeTab, setActiveTab] = useState('master')
  const [search, setSearch] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState({ name:'', unit:'pcs', price:'', stock:0, categoryId:'' })
  const [syncStatus, setSyncStatus] = useState('idle')

  useEffect(()=>{
    const c = JSON.parse(localStorage.getItem(CATEGORIES_KEY) || '[]')
    const p = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '[]')
    const s = JSON.parse(localStorage.getItem(SALES_KEY) || '[]')
    const o = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
    const st = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    if((!c || c.length===0)){
      const defaults = ['Liquor','Softdrinks','Snacks','Cigarettes']
      const cats = defaults.map(n=> ({ id: uid('C'), name:n, collapsed:true }))
      setCategories(cats)
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats))
    } else setCategories(c)
    setProducts(p)
    setSales(s)
    setOutbox(o)
    setSettings(s=> ({...s, ...st}))
  }, [])

  useEffect(()=> localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)), [products])
  useEffect(()=> localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories)), [categories])
  useEffect(()=> localStorage.setItem(SALES_KEY, JSON.stringify(sales)), [sales])
  useEffect(()=> localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)), [outbox])
  useEffect(()=> localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings])

  async function flushOutboxToFirestore() {
    if(!ENABLE_FIREBASE || !db) return;
    if(settings.mode === 'offline') return;
    if(!navigator.onLine) return;
    if(outbox.length === 0) return;
    setSyncStatus('syncing');
    try {
      for(const it of [...outbox]){
        if(it.type === 'product'){
          const d = doc(db, 'products', it.payload.id);
          if(it.action === 'create' || it.action === 'update'){
            await setDoc(d, it.payload);
          } else if(it.action === 'delete'){
            await deleteDoc(d);
          }
        } else if(it.type === 'category'){
          const d = doc(db, 'categories', it.payload.id);
          if(it.action === 'create' || it.action === 'update'){
            await setDoc(d, it.payload);
          } else if(it.action === 'delete'){
            await deleteDoc(d);
          }
        } else if(it.type === 'sale'){
          const d = doc(db, 'sales', it.payload.id);
          if(it.action === 'create') await setDoc(d, it.payload);
        }
        setOutbox(prev => prev.filter(x => x.id !== it.id));
      }
      setSyncStatus('idle');
    } catch(err){
      console.error('flush error', err);
      setSyncStatus('error');
    }
  }

  async function pullFromFirestore(){
    if(!ENABLE_FIREBASE || !db) return;
    if(!navigator.onLine) return;
    setSyncStatus('pulling');
    try {
      const cSnap = await getDocs(collection(db, 'categories'));
      const pSnap = await getDocs(collection(db, 'products'));
      const sSnap = await getDocs(collection(db, 'sales'));
      const rc = cSnap.docs.map(d => d.data());
      const rp = pSnap.docs.map(d => d.data());
      const rs = sSnap.docs.map(d => d.data());
      if(rc.length) setCategories(rc);
      if(rp.length) setProducts(rp);
      if(rs.length) setSales(rs);
      setSyncStatus('idle');
    } catch(err){
      console.error('pull error', err);
      setSyncStatus('error');
    }
  }

  async function tryAutoSync(){
    if(settings.mode === 'offline') return;
    if(!ENABLE_FIREBASE) return;
    if(!navigator.onLine) return;
    await flushOutboxToFirestore();
    await pullFromFirestore();
  }

  useEffect(()=>{
    const t = setInterval(()=> { if(navigator.onLine) tryAutoSync(); }, 15000);
    window.addEventListener('online', tryAutoSync);
    return ()=> { clearInterval(t); window.removeEventListener('online', tryAutoSync); }
  }, [outbox, settings, products, categories])

  function addCategory(){
    const name = prompt('New category name (e.g. Liquor)')
    if(!name) return
    const c = { id: uid('C'), name, collapsed:true }
    setCategories(prev=> [...prev, c])
    setOutbox(prev=> [...prev, { id: uid('O'), type:'category', action:'create', payload:c, ts:Date.now() }])
  }
  function toggleCategory(catId){ setCategories(prev=> prev.map(c=> c.id===catId? {...c, collapsed: !c.collapsed} : c)) }
  function deleteCategory(catId){ if(!confirm('Delete category and its products?')) return; setProducts(prev=> prev.filter(p=> p.categoryId !== catId)); setCategories(prev=> prev.filter(c=> c.id!==catId)); setOutbox(prev=> [...prev, { id: uid('O'), type:'category', action:'delete', payload:{id:catId}, ts:Date.now() }]) }

  function openProductForm(categoryId){ setProductForm(f=> ({...f, categoryId: categoryId || f.categoryId || (categories[0] && categories[0].id)})); setEditingProduct(null); setShowProductForm(true) }
  function editProduct(p){ setEditingProduct(p.id); setProductForm({ name:p.name, unit:p.unit, price:p.price, stock:p.stock||0, categoryId:p.categoryId }); setShowProductForm(true) }

  function saveProduct(e){ e&& e.preventDefault(); const name = productForm.name.trim(); const price = parseFloat(productForm.price); if(!name || isNaN(price)) return alert('Provide name and price');
    if(editingProduct){ const updated = {...productForm, id: editingProduct, price: parseFloat(productForm.price)}; setProducts(prev=> prev.map(x=> x.id===editingProduct? {...x, ...productForm, price}: x)); setOutbox(prev=> [...prev, { id: uid('O'), type:'product', action:'update', payload: updated, ts:Date.now() }]); }
    else { const rec = { id: uid('P'), name: productForm.name, unit: productForm.unit, price: parseFloat(productForm.price), stock: parseInt(productForm.stock)||0, categoryId: productForm.categoryId }; setProducts(prev=> [...prev, rec]); setOutbox(prev=> [...prev, { id: uid('O'), type:'product', action:'create', payload: rec, ts:Date.now() }]); }
    setCart(prev=> prev.map(ci=> { if(ci.sourceProductId && products.some(p=> p.id===ci.sourceProductId)){ const prod = products.find(p=> p.id === ci.sourceProductId); return prod? {...ci, name: prod.name, unit: prod.unit, price: prod.price} : ci } return ci }))
    setShowProductForm(false)
  }

  function deleteProduct(pid){ if(!confirm('Delete product?')) return; setProducts(prev=> prev.filter(p=> p.id !== pid)); setOutbox(prev=> [...prev, { id: uid('O'), type:'product', action:'delete', payload: {id:pid}, ts:Date.now() }]); }

  function addToCartFromProduct(p){ setCart(prev=> [...prev, { name:p.name, unit:p.unit, price:p.price, qty:1, sourceProductId:p.id }]); }
  function addToCartFromSelect(pid){ const p = products.find(x=> x.id===pid); if(!p) return; addToCartFromProduct(p) }
  function editCartItem(idx, updated){ setCart(prev=> prev.map((it,i)=> i===idx? {...it, ...updated} : it)) }
  function removeCartItem(idx){ if(!confirm('Remove item?')) return; setCart(prev=> prev.filter((_,i)=> i!==idx)) }
  function finalizeSale(){ if(cart.length===0) return alert('Cart empty'); const now = new Date(); const tx = { id: uid('TX'), datetime: now.toLocaleString(), items: cart.map(i=> ({...i, subtotal: i.price * i.qty})), total: cart.reduce((s,i)=> s + i.price*i.qty, 0) }; setSales(prev=> [...prev, tx]); setOutbox(prev=> [...prev, { id: uid('O'), type:'sale', action:'create', payload: tx, ts:Date.now() }]); setCart([]); alert('Sale saved locally — will sync when online') }

  function printProductMaster(){ let html = `<html><head><meta charset=\"utf-8\"><title>Product Master</title></head><body>`; html += `<h2>FLORA\'S STORE — PRODUCT MASTER</h2>`; categories.forEach(cat=>{ html += `<h3>${cat.name}</h3><ul>`; products.filter(p=> p.categoryId===cat.id).forEach(p=> html += `<li>${p.name} — ${p.unit} — ${fmt(p.price)}${p.stock? ' — stock ' + p.stock : ''}</li>`); html += `</ul>` }); html += `</body></html>`; const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print(); }

  function exportProducts(){ const rows = products.map(p=> ({ ID:p.id, Name:p.name, Category: categories.find(c=> c.id===p.categoryId)?.name || '', Unit:p.unit, Price:p.price, Stock:p.stock||0 })); const ws = window.XLSX ? window.XLSX.utils.json_to_sheet(rows) : null; if(ws){ const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Products'); window.XLSX.writeFile(wb, 'products.xlsx'); } else alert('XLSX library not loaded for export') }

  const visibleCategories = categories.filter(c=> c.name.toLowerCase().includes(search.toLowerCase()) || products.some(p=> p.categoryId === c.id && p.name.toLowerCase().includes(search.toLowerCase())) )

  return (
    <div className="max-w-4xl mx-auto p-4">
      <header className="text-center mb-4">
        <h1 className="text-2xl font-bold">Flora's Store — Hybrid POS (React)</h1>
        <p className="text-sm text-gray-500">Grid master + Cart — offline-first, Firebase-ready</p>
      </header>

      <div className="flex gap-2 mb-4">
        <div>
          <label className="text-xs">Mode</label>
          <select value={settings.mode} onChange={e=> setSettings(s=> ({...s, mode:e.target.value}))} className="border p-2 rounded">
            <option value="auto">Auto</option>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="px-3 py-2 rounded text-sm">Sync: {syncStatus}</div>
          <button className="px-3 py-2 bg-pink-200 rounded" onClick={printProductMaster}>Print Master</button>
          <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={exportProducts}>Export</button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={()=> setActiveTab('master')} className={`flex-1 p-2 rounded ${activeTab==='master'? 'bg-white shadow': 'bg-gray-100'}`}>Product Master</button>
        <button onClick={()=> setActiveTab('cart')} className={`flex-1 p-2 rounded ${activeTab==='cart'? 'bg-white shadow': 'bg-gray-100'}`}>Cart / Checkout</button>
      </div>

      {activeTab === 'master' && (
        <section className="bg-white p-4 rounded shadow">
          <div className="mb-3 flex gap-2">
            <input placeholder="Search categories or products" value={search} onChange={e=> setSearch(e.target.value)} className="flex-1 border p-2 rounded" />
            <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={addCategory}>Add Category</button>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-auto">
            {visibleCategories.map(cat => (
              <div key={cat.id} className="border p-3 rounded">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={()=> toggleCategory(cat.id)}>{cat.collapsed ? 'Show' : 'Hide'}</button>
                    <div className="text-lg font-semibold">{cat.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 bg-green-200 rounded" onClick={()=> openProductForm(cat.id)}>Add Product</button>
                    <button className="px-2 py-1 bg-yellow-200 rounded" onClick={()=> { const n = prompt('Rename category', cat.name); if(n) setCategories(prev=> prev.map(c=> c.id===cat.id? {...c, name:n}: c)) }}>Rename</button>
                    <button className="px-2 py-1 bg-red-200 rounded" onClick={()=> deleteCategory(cat.id)}>Delete</button>
                  </div>
                </div>

                {!cat.collapsed && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {products.filter(p=> p.categoryId === cat.id && p.name.toLowerCase().includes(search.toLowerCase())).length === 0 && <div className="text-sm text-gray-400">No products yet</div>}
                    {products.filter(p=> p.categoryId === cat.id && p.name.toLowerCase().includes(search.toLowerCase())).map(p=> (
                      <div key={p.id} className="border p-3 rounded flex flex-col justify-between">
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.unit} • {fmt(p.price)} {p.stock? `• stock ${p.stock}`: ''}</div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button className="flex-1 bg-blue-200 rounded p-2" onClick={()=> addToCartFromProduct(p)}>Add</button>
                          <button className="bg-yellow-200 rounded p-2" onClick={()=> editProduct(p)}>Edit</button>
                          <button className="bg-red-200 rounded p-2" onClick={()=> deleteProduct(p.id)}>Del</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'cart' && (
        <section className="bg-white p-4 rounded shadow">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="col-span-2">
              <label className="text-xs">Category</label>
              <select onChange={e=> setProductForm(f=> ({...f, categoryId: e.target.value}))} className="border p-2 rounded w-full">
                <option value="">All categories</option>
                {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs">&nbsp;</label>
              <button className="bg-blue-600 text-white rounded p-2 w-full" onClick={()=> {}}>Show</button>
            </div>

            <select id="productSelect" className="col-span-2 border p-2 rounded">
              <option value="">Select product...</option>
              {products.map(p=> <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)}</option>)}
            </select>
            <button className="bg-blue-600 text-white rounded p-2" onClick={()=> { const sel = document.getElementById('productSelect'); if(sel && sel.value) addToCartFromSelect(sel.value) }}>Add</button>

            <input id="cartPrice" placeholder="Price" className="border p-2 rounded" />
            <input id="cartQty" placeholder="Qty" className="border p-2 rounded" />
            <input id="cartUnit" placeholder="Unit" className="border p-2 rounded" />
          </div>

          <div className="overflow-auto mb-3">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-600"><tr><th>Product</th><th>Unit</th><th>Price</th><th>Qty</th><th>Subtotal</th><th>Action</th></tr></thead>
              <tbody>
                {cart.map((it, idx)=> (
                  <tr key={idx}>
                    <td>{it.name}</td>
                    <td>{it.unit}</td>
                    <td>{fmt(it.price)}</td>
                    <td>{it.qty}</td>
                    <td>{fmt(it.price * it.qty)}</td>
                    <td><div className="flex gap-2"><button className="bg-yellow-200 px-2 rounded" onClick={()=> editCartItem(idx, {...it, qty: it.qty + 1})}>+1</button><button className="bg-red-200 px-2 rounded" onClick={()=> removeCartItem(idx)}>Remove</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-xl font-bold">{fmt(cart.reduce((s,i)=> s + i.price*i.qty, 0))}</div>
            </div>
            <div className="flex gap-2">
              <button className="bg-pink-400 text-white px-3 py-2 rounded" onClick={()=> {}}>Print Receipt</button>
              <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={finalizeSale}>Finalize & Save</button>
            </div>
          </div>
        </section>
      )}

      {showProductForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <form onSubmit={saveProduct} className="bg-white p-4 rounded w-11/12 max-w-md">
            <h3 className="text-lg font-semibold mb-2">{editingProduct ? 'Edit product' : 'Add product'}</h3>
            <div className="grid gap-2">
              <input value={productForm.name} onChange={e=> setProductForm(f=> ({...f, name: e.target.value}))} placeholder="Name" className="border p-2 rounded" />
              <div className="flex gap-2">
                <select value={productForm.categoryId} onChange={e=> setProductForm(f=> ({...f, categoryId: e.target.value}))} className="flex-1 border p-2 rounded">
                  <option value="">Choose category</option>
                  {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input value={productForm.unit} onChange={e=> setProductForm(f=> ({...f, unit: e.target.value}))} placeholder="Unit" className="w-28 border p-2 rounded" />
              </div>
              <div className="flex gap-2">
                <input value={productForm.price} onChange={e=> setProductForm(f=> ({...f, price: e.target.value}))} placeholder="Price" className="border p-2 rounded flex-1" />
                <input value={productForm.stock} onChange={e=> setProductForm(f=> ({...f, stock: e.target.value}))} placeholder="Stock" className="w-28 border p-2 rounded" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-3 py-2 bg-gray-200 rounded" onClick={()=> { setShowProductForm(false); setProductForm({ name:'', unit:'pcs', price:'', stock:0, categoryId:'' }) }}>Cancel</button>
                <button type="submit" className="px-3 py-2 bg-pink-400 text-white rounded">Save</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div id="receiptEditor" style={{display:'none'}}></div>

    </div>
  )
}

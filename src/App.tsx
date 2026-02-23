import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type ItemRow = {
  id: string
  title: string
  created_at: string
}

type SubItemRow = {
  id: string
  node_id: string
  title: string
  scheduled_on: string | null
  tags: string[] | null
  body: string
  created_at: string
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'denied'>(
    'unknown',
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')

  const [items, setItems] = useState<ItemRow[]>([])
  const [subItems, setSubItems] = useState<SubItemRow[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const [itemTitle, setItemTitle] = useState('')
  const [renameItemTitle, setRenameItemTitle] = useState('')
  const [subItemTitle, setSubItemTitle] = useState('')
  const [subItemDate, setSubItemDate] = useState('')
  const [subItemTagsInput, setSubItemTagsInput] = useState('')
  const [subItemBody, setSubItemBody] = useState('')

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null

  useEffect(() => {
    setRenameItemTitle(selectedItem?.title ?? '')
  }, [selectedItem?.id, selectedItem?.title])

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }
    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setAccessStatus('unknown')
      return
    }

    const email = session.user.email?.trim().toLowerCase()
    if (!email) {
      setError('Googleアカウントのメールアドレスが取得できませんでした。')
      setAccessStatus('denied')
      void supabase.auth.signOut()
      return
    }

    let active = true
    const verifyAccess = async () => {
      setError('')
      setAccessStatus('checking')
      const { data, error: verifyError } = await supabase
        .from('allowed_users')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (!active) return

      if (verifyError) {
        setError(verifyError.message)
        setAccessStatus('denied')
        await supabase.auth.signOut()
        return
      }

      if (!data) {
        setError('このGoogleアカウントは許可されていません。')
        setAccessStatus('denied')
        await supabase.auth.signOut()
        return
      }

      setAccessStatus('allowed')
    }

    void verifyAccess()
    return () => {
      active = false
    }
  }, [session])

  const loadItems = async () => {
    const { data, error: loadError } = await supabase
      .from('nodes')
      .select('id, title, created_at')
      .is('parent_id', null)
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    const loadedItems = (data ?? []) as ItemRow[]
    setItems(loadedItems)
    setSelectedItemId((current) => {
      if (current && loadedItems.some((item) => item.id === current)) return current
      return loadedItems[0]?.id ?? null
    })
  }

  const loadSubItems = async (itemId: string) => {
    const { data, error: loadError } = await supabase
      .from('threads')
      .select('id, node_id, title, scheduled_on, tags, body, created_at')
      .eq('node_id', itemId)
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    setSubItems((data ?? []) as SubItemRow[])
  }

  useEffect(() => {
    if (!session || accessStatus !== 'allowed') {
      setItems([])
      setSubItems([])
      setSelectedItemId(null)
      return
    }
    void loadItems()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      return
    }
    void loadSubItems(selectedItemId)
  }, [selectedItemId])

  const loginWithGoogle = async () => {
    setError('')
    setAuthLoading(true)
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (signInError) {
      setError(signInError.message)
      setAuthLoading(false)
    }
  }

  const logout = async () => {
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  const submitItem = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!itemTitle.trim()) {
      setError('項目名は必須です。')
      return
    }

    const { error: insertError } = await supabase.from('nodes').insert({
      type: 'game',
      title: itemTitle.trim(),
      parent_id: null,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setItemTitle('')
    await loadItems()
  }

  const submitRenameItem = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!selectedItemId) {
      setError('先に名前変更したい項目を選択してください。')
      return
    }
    if (!renameItemTitle.trim()) {
      setError('変更後の項目名は必須です。')
      return
    }

    const { error: updateError } = await supabase
      .from('nodes')
      .update({ title: renameItemTitle.trim() })
      .eq('id', selectedItemId)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadItems()
  }

  const deleteSelectedItem = async () => {
    setError('')
    if (!selectedItem) {
      setError('先に削除したい項目を選択してください。')
      return
    }

    const confirmed = window.confirm(`「${selectedItem.title}」を削除しますか？`)
    if (!confirmed) return

    const { error: deleteError } = await supabase.from('nodes').delete().eq('id', selectedItem.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadItems()
  }

  const submitSubItem = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!selectedItemId) {
      setError('先に親項目を選択してください。')
      return
    }
    if (!subItemTitle.trim()) {
      setError('項目内項目名は必須です。')
      return
    }
    if (!subItemBody.trim()) {
      setError('本文は必須です。')
      return
    }

    const tags = subItemTagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    const { error: insertError } = await supabase.from('threads').insert({
      node_id: selectedItemId,
      title: subItemTitle.trim(),
      scheduled_on: subItemDate || null,
      tags,
      body: subItemBody.trim(),
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSubItemTitle('')
    setSubItemDate('')
    setSubItemTagsInput('')
    setSubItemBody('')
    await loadSubItems(selectedItemId)
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>ストーリーDB ログイン</h1>
          <p className="subtle">Googleでログイン（許可済みアカウントのみ）</p>
          <button type="button" onClick={loginWithGoogle} disabled={authLoading}>
            {authLoading ? 'リダイレクト中...' : 'Googleでログイン'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </main>
    )
  }

  if (accessStatus === 'unknown' || accessStatus === 'checking') {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>ストーリーDB ログイン</h1>
          <p className="subtle">アクセス権を確認中...</p>
        </div>
      </main>
    )
  }

  if (accessStatus === 'denied') {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>ストーリーDB ログイン</h1>
          <p className="subtle">このアカウントは許可されていません。サインアウトします...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>ストーリー項目エディタ</h1>
          <p>{session.user.email}</p>
        </div>
        <button onClick={logout}>ログアウト</button>
      </header>

      {error && <p className="error global-error">{error}</p>}

      <section className="workspace">
        <aside className="panel sidebar">
          <h2>項目</h2>
          <form className="stack-form" onSubmit={submitItem}>
            <label>
              新しい項目名
              <input
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                placeholder="例: A"
                required
              />
            </label>
            <button type="submit">項目追加</button>
          </form>

          <div className="list item-list">
            {items.length === 0 ? (
              <p className="subtle">まだ項目がありません</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  className={`list-item ${selectedItemId === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  {item.title}
                </button>
              ))
            )}
          </div>

          <form className="stack-form" onSubmit={submitRenameItem}>
            <label>
              選択中項目の名前変更
              <input
                value={renameItemTitle}
                onChange={(event) => setRenameItemTitle(event.target.value)}
                placeholder="変更後の項目名"
                disabled={!selectedItemId}
                required
              />
            </label>
            <div className="item-action-row">
              <button type="submit" disabled={!selectedItemId}>
                名前変更
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={deleteSelectedItem}
                disabled={!selectedItemId}
              >
                項目削除
              </button>
            </div>
          </form>
        </aside>

        <section className="panel content-panel">
          <div className="content-head">
            <h2>{selectedItem ? `項目: ${selectedItem.title}` : '項目を選択してください'}</h2>
            <p className="subtle">
              {selectedItem
                ? 'この項目に「項目内項目」「日付」「タグ」「本文」を追加できます。'
                : '左の一覧から項目を選ぶか、新しく作成してください。'}
            </p>
          </div>

          <div className="subitem-list">
            {selectedItemId ? (
              subItems.length === 0 ? (
                <p className="subtle">まだ項目内項目がありません</p>
              ) : (
                subItems.map((subItem) => (
                  <article key={subItem.id} className="subitem-card">
                    <header className="subitem-header">
                      <h3>{subItem.title}</h3>
                      <p className="subtle">{subItem.scheduled_on || '日付未設定'}</p>
                    </header>
                    {subItem.tags && subItem.tags.length > 0 && (
                      <div className="tag-list">
                        {subItem.tags.map((tag) => (
                          <span key={`${subItem.id}-${tag}`} className="tag-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="subitem-body">{subItem.body}</p>
                  </article>
                ))
              )
            ) : (
              <p className="subtle">項目を選択するとここにデータが表示されます</p>
            )}
          </div>

          <form className="stack-form subitem-form" onSubmit={submitSubItem}>
            <h3>項目内項目を追加</h3>
            <label>
              項目内項目
              <input
                value={subItemTitle}
                onChange={(event) => setSubItemTitle(event.target.value)}
                placeholder="例: 導入シーン"
                required
              />
            </label>
            <label>
              日付
              <input
                type="date"
                value={subItemDate}
                onChange={(event) => setSubItemDate(event.target.value)}
              />
            </label>
            <label>
              項目タグ付け（カンマ区切り）
              <input
                value={subItemTagsInput}
                onChange={(event) => setSubItemTagsInput(event.target.value)}
                placeholder="例: 重要, イベント, 修正待ち"
              />
            </label>
            <label>
              本文
              <textarea
                rows={6}
                value={subItemBody}
                onChange={(event) => setSubItemBody(event.target.value)}
                placeholder="項目内項目の本文を入力"
                required
              />
            </label>
            <button type="submit" disabled={!selectedItemId}>
              項目内項目を追加
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}

export default App

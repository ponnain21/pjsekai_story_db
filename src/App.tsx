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
  sort_order: number
  created_at: string
}

type SubItemTemplateRow = {
  id: string
  title: string
  scheduled_on: string | null
  tags: string[] | null
  body: string
  created_at: string
}

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'denied'>(
    'unknown',
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [items, setItems] = useState<ItemRow[]>([])
  const [subItems, setSubItems] = useState<SubItemRow[]>([])
  const [subItemTemplates, setSubItemTemplates] = useState<SubItemTemplateRow[]>([])

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const [itemTitle, setItemTitle] = useState('')
  const [renameItemTitle, setRenameItemTitle] = useState('')
  const [subItemTitle, setSubItemTitle] = useState('')
  const [subItemDate, setSubItemDate] = useState('')
  const [subItemTagsInput, setSubItemTagsInput] = useState('')
  const [selectedSubItemBody, setSelectedSubItemBody] = useState('')
  const [bodySaving, setBodySaving] = useState(false)

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedSubItem = subItems.find((subItem) => subItem.id === selectedSubItemId) ?? null

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
      .select('id, node_id, title, scheduled_on, tags, body, sort_order, created_at')
      .eq('node_id', itemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    const loadedSubItems = (data ?? []) as SubItemRow[]
    setSubItems(loadedSubItems)
    setSelectedSubItemId((current) => {
      if (current && loadedSubItems.some((subItem) => subItem.id === current)) return current
      return loadedSubItems[0]?.id ?? null
    })
  }

  const loadSubItemTemplates = async () => {
    const { data, error: loadError } = await supabase
      .from('subitem_templates')
      .select('id, title, scheduled_on, tags, body, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    setSubItemTemplates((data ?? []) as SubItemTemplateRow[])
  }

  useEffect(() => {
    if (!session || accessStatus !== 'allowed') {
      setItems([])
      setSubItems([])
      setSubItemTemplates([])
      setSelectedItemId(null)
      setSelectedSubItemId(null)
      setSelectedTemplateId('')
      return
    }
    void loadItems()
    void loadSubItemTemplates()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      setSelectedSubItemId(null)
      return
    }
    void loadSubItems(selectedItemId)
  }, [selectedItemId])

  useEffect(() => {
    setSelectedSubItemBody(selectedSubItem?.body ?? '')
  }, [selectedSubItem?.id, selectedSubItem?.body])

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
    setSettingsOpen(false)
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

  const applySelectedTemplateToForm = () => {
    setError('')
    if (!selectedTemplateId) {
      setError('先にテンプレートを選択してください。')
      return
    }

    const template = subItemTemplates.find((item) => item.id === selectedTemplateId)
    if (!template) {
      setError('選択したテンプレートが見つかりませんでした。')
      return
    }

    setSubItemTitle(template.title)
    setSubItemDate(template.scheduled_on ?? '')
    setSubItemTagsInput((template.tags ?? []).join(', '))
  }

  const saveCurrentFormAsTemplate = async () => {
    setError('')

    if (!subItemTitle.trim()) {
      setError('テンプレート保存には項目内項目名が必要です。')
      return
    }

    const tags = parseTags(subItemTagsInput)

    const { data, error: insertError } = await supabase
      .from('subitem_templates')
      .insert({
        title: subItemTitle.trim(),
        scheduled_on: subItemDate || null,
        tags,
        body: '',
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    await loadSubItemTemplates()
    if (data?.id) setSelectedTemplateId(data.id)
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

    const tags = parseTags(subItemTagsInput)
    const nextSortOrder =
      subItems.length === 0 ? 0 : Math.max(...subItems.map((subItem) => subItem.sort_order)) + 1

    const { error: insertError } = await supabase.from('threads').insert({
      node_id: selectedItemId,
      title: subItemTitle.trim(),
      scheduled_on: subItemDate || null,
      tags,
      body: '',
      sort_order: nextSortOrder,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSubItemTitle('')
    setSubItemDate('')
    setSubItemTagsInput('')
    await loadSubItems(selectedItemId)
  }

  const saveSelectedSubItemBody = async () => {
    setError('')
    if (!selectedSubItemId) {
      setError('先に本文を編集する項目内項目を選択してください。')
      return
    }
    setBodySaving(true)
    const { error: updateError } = await supabase
      .from('threads')
      .update({ body: selectedSubItemBody })
      .eq('id', selectedSubItemId)
    setBodySaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    if (selectedItemId) await loadSubItems(selectedItemId)
  }

  const moveSubItem = async (subItemId: string, direction: 'up' | 'down') => {
    if (!selectedItemId) return
    const currentIndex = subItems.findIndex((subItem) => subItem.id === subItemId)
    if (currentIndex < 0) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= subItems.length) return

    const current = subItems[currentIndex]
    const target = subItems[targetIndex]

    setError('')

    const { error: firstError } = await supabase
      .from('threads')
      .update({ sort_order: target.sort_order })
      .eq('id', current.id)
    if (firstError) {
      setError(firstError.message)
      return
    }

    const { error: secondError } = await supabase
      .from('threads')
      .update({ sort_order: current.sort_order })
      .eq('id', target.id)
    if (secondError) {
      setError(secondError.message)
      return
    }

    await loadSubItems(selectedItemId)
  }

  const deleteSubItem = async (subItem: SubItemRow) => {
    setError('')
    const confirmed = window.confirm(`項目内項目「${subItem.title}」を削除しますか？`)
    if (!confirmed) return

    const { error: deleteError } = await supabase.from('threads').delete().eq('id', subItem.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    if (selectedItemId) await loadSubItems(selectedItemId)
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
      {error && <p className="error global-error">{error}</p>}

      <section className="workspace">
        <aside className="panel sidebar">
          <div className="sidebar-head">
            <h2>項目</h2>
            <button
              type="button"
              className="ghost-button logout-mini"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              設定
            </button>
          </div>
          {settingsOpen && (
            <section className="settings-box">
              <div className="settings-head">
                <p className="subtle">設定メニュー</p>
                <button
                  type="button"
                  className="ghost-button close-mini"
                  onClick={() => setSettingsOpen(false)}
                >
                  閉じる
                </button>
              </div>
              <button type="button" className="danger-button settings-logout" onClick={logout}>
                ログアウト
              </button>
            </section>
          )}

          <form className="stack-form item-create-form" onSubmit={submitItem}>
            <label className="sr-only" htmlFor="new-item-title">
              新しい項目名
            </label>
            <div className="item-create-row">
              <input
                id="new-item-title"
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                placeholder="新しい項目名"
                required
              />
              <button type="submit">項目追加</button>
            </div>
          </form>

          <div className="list item-list">
            {items.length === 0 ? (
              <p className="subtle">まだ項目がありません</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  className={`list-item item-list-item ${selectedItemId === item.id ? 'active' : ''}`}
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
                ? '項目内項目を使い回し・並べ替え・削除できます。'
                : '左の一覧から項目を選ぶか、新しく作成してください。'}
            </p>
          </div>

          <div className="subitem-list">
            {selectedItemId ? (
              subItems.length === 0 ? (
                <p className="subtle">まだ項目内項目がありません</p>
              ) : (
                subItems.map((subItem, index) => (
                  <article
                    key={subItem.id}
                    className={`subitem-card ${selectedSubItemId === subItem.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSubItemId(subItem.id)}
                  >
                    <header className="subitem-header">
                      <div>
                        <h3>{subItem.title}</h3>
                        <p className="subtle">{subItem.scheduled_on || '日付未設定'}</p>
                      </div>
                      <div className="subitem-actions">
                        <button
                          type="button"
                          className="ghost-button mini-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            void moveSubItem(subItem.id, 'up')
                          }}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="ghost-button mini-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            void moveSubItem(subItem.id, 'down')
                          }}
                          disabled={index === subItems.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="danger-button mini-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteSubItem(subItem)
                          }}
                        >
                          削除
                        </button>
                      </div>
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
                  </article>
                ))
              )
            ) : (
              <p className="subtle">項目を選択するとここにデータが表示されます</p>
            )}
          </div>

          <form className="stack-form subitem-form" onSubmit={submitSubItem}>
            <h3>項目内項目を追加</h3>

            <div className="template-tools">
              <p className="subtle">使い回しテンプレート</p>
              <div className="template-row">
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  <option value="">テンプレートを選択</option>
                  {subItemTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
                <button type="button" className="ghost-button" onClick={applySelectedTemplateToForm}>
                  読み込み
                </button>
                <button type="button" className="ghost-button" onClick={saveCurrentFormAsTemplate}>
                  現在入力を保存
                </button>
              </div>
            </div>

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
            <button type="submit" disabled={!selectedItemId}>
              項目内項目を追加
            </button>
          </form>

          <section className="stack-form body-editor">
            <h3>本文入力</h3>
            <p className="subtle">
              {selectedSubItem
                ? `選択中: ${selectedSubItem.title}`
                : '本文を入力する項目内項目を上の一覧から選択してください'}
            </p>
            <textarea
              rows={8}
              value={selectedSubItemBody}
              onChange={(event) => setSelectedSubItemBody(event.target.value)}
              placeholder="ここに本文を入力"
              disabled={!selectedSubItem}
            />
            <button type="button" onClick={saveSelectedSubItemBody} disabled={!selectedSubItem || bodySaving}>
              {bodySaving ? '保存中...' : '本文を保存'}
            </button>
          </section>
        </section>
      </section>
    </main>
  )
}

export default App

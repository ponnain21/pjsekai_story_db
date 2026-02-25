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
  created_at: string
}

type TagPresetRow = {
  id: string
  name: string
  created_at: string
}

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'denied'>(
    'unknown',
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')

  const [pageMode, setPageMode] = useState<'main' | 'settings'>('main')

  const [items, setItems] = useState<ItemRow[]>([])
  const [subItems, setSubItems] = useState<SubItemRow[]>([])
  const [subItemTemplates, setSubItemTemplates] = useState<SubItemTemplateRow[]>([])
  const [tagPresets, setTagPresets] = useState<TagPresetRow[]>([])

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedSettingsTemplateId, setSelectedSettingsTemplateId] = useState<string | null>(null)
  const [selectedSettingsTagId, setSelectedSettingsTagId] = useState<string | null>(null)

  const [itemTitle, setItemTitle] = useState('')
  const [renameItemTitle, setRenameItemTitle] = useState('')

  const [settingsTemplateTitle, setSettingsTemplateTitle] = useState('')
  const [settingsTagName, setSettingsTagName] = useState('')
  const [mainScheduledOn, setMainScheduledOn] = useState('')
  const [mainSelectedTags, setMainSelectedTags] = useState<string[]>([])
  const [mainTemplateTitle, setMainTemplateTitle] = useState('')
  const [mainNewTagName, setMainNewTagName] = useState('')

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedSettingsTemplate =
    subItemTemplates.find((template) => template.id === selectedSettingsTemplateId) ?? null
  const selectedSettingsTag = tagPresets.find((tag) => tag.id === selectedSettingsTagId) ?? null

  useEffect(() => {
    setRenameItemTitle(selectedItem?.title ?? '')
  }, [selectedItem?.id, selectedItem?.title])

  useEffect(() => {
    if (!selectedSettingsTemplate) {
      setSettingsTemplateTitle('')
      return
    }
    setSettingsTemplateTitle(selectedSettingsTemplate.title)
  }, [selectedSettingsTemplate?.id])

  useEffect(() => {
    if (!selectedSettingsTag) {
      setSettingsTagName('')
      return
    }
    setSettingsTagName(selectedSettingsTag.name)
  }, [selectedSettingsTag?.id])

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

    setSubItems((data ?? []) as SubItemRow[])
  }

  const loadSubItemTemplates = async () => {
    const { data, error: loadError } = await supabase
      .from('subitem_templates')
      .select('id, title, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    setSubItemTemplates((data ?? []) as SubItemTemplateRow[])
  }

  const loadTagPresets = async () => {
    const { data, error: loadError } = await supabase
      .from('subitem_tag_presets')
      .select('id, name, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    const loadedTags = (data ?? []) as TagPresetRow[]
    setTagPresets(loadedTags)
    setSelectedSettingsTagId((current) => {
      if (current && loadedTags.some((tag) => tag.id === current)) return current
      return loadedTags[0]?.id ?? null
    })
  }

  useEffect(() => {
    if (!session || accessStatus !== 'allowed') {
      setItems([])
      setSubItems([])
      setSubItemTemplates([])
      setTagPresets([])
      setSelectedItemId(null)
      setSelectedSettingsTemplateId(null)
      setSelectedSettingsTagId(null)
      return
    }
    void loadItems()
    void loadSubItemTemplates()
    void loadTagPresets()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      setMainScheduledOn('')
      setMainSelectedTags([])
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

  const toggleMainTag = (name: string) => {
    setMainSelectedTags((current) =>
      current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name],
    )
  }

  const createTagPresetFromSettings = async () => {
    setError('')
    const trimmed = settingsTagName.trim()
    if (!trimmed) {
      setError('追加するタグ名を入力してください。')
      return
    }

    const { data, error: insertError } = await supabase
      .from('subitem_tag_presets')
      .upsert({ name: trimmed }, { onConflict: 'name' })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSettingsTagName('')
    await loadTagPresets()
    if (data?.id) setSelectedSettingsTagId(data.id)
  }

  const addTagPresetFromMain = async () => {
    setError('')
    const trimmed = mainNewTagName.trim()
    if (!trimmed) {
      setError('追加するタグ名を入力してください。')
      return
    }

    const { error: insertError } = await supabase
      .from('subitem_tag_presets')
      .upsert({ name: trimmed }, { onConflict: 'name', ignoreDuplicates: true })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setMainNewTagName('')
    await loadTagPresets()
  }

  const updateSelectedTagFromSettings = async () => {
    setError('')

    if (!selectedSettingsTagId) {
      setError('更新するタグを一覧から選択してください。')
      return
    }
    if (!settingsTagName.trim()) {
      setError('タグ名を入力してください。')
      return
    }

    const { error: updateError } = await supabase
      .from('subitem_tag_presets')
      .update({ name: settingsTagName.trim() })
      .eq('id', selectedSettingsTagId)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadTagPresets()
  }

  const deleteSelectedTagFromSettings = async () => {
    setError('')

    if (!selectedSettingsTag) {
      setError('削除するタグを一覧から選択してください。')
      return
    }

    const confirmed = window.confirm(`タグ「${selectedSettingsTag.name}」を削除しますか？`)
    if (!confirmed) return

    const { error: deleteError } = await supabase
      .from('subitem_tag_presets')
      .delete()
      .eq('id', selectedSettingsTag.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadTagPresets()
    setMainSelectedTags((current) => current.filter((name) => name !== selectedSettingsTag.name))
  }

  const createTemplateFromSettings = async () => {
    setError('')

    if (!settingsTemplateTitle.trim()) {
      setError('項目内項目名を入力してください。')
      return
    }

    const { data, error: insertError } = await supabase
      .from('subitem_templates')
      .insert({
        title: settingsTemplateTitle.trim(),
        scheduled_on: null,
        tags: [],
        body: '',
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    await loadSubItemTemplates()
    if (data?.id) setSelectedSettingsTemplateId(data.id)
  }

  const createTemplateFromMain = async () => {
    setError('')

    if (!mainTemplateTitle.trim()) {
      setError('追加する項目内項目名を入力してください。')
      return
    }

    const { error: insertError } = await supabase.from('subitem_templates').insert({
      title: mainTemplateTitle.trim(),
      scheduled_on: null,
      tags: [],
      body: '',
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setMainTemplateTitle('')
    await loadSubItemTemplates()
  }

  const updateSelectedTemplate = async () => {
    setError('')

    if (!selectedSettingsTemplateId) {
      setError('更新する項目内項目を一覧から選択してください。')
      return
    }
    if (!settingsTemplateTitle.trim()) {
      setError('項目内項目名を入力してください。')
      return
    }

    const { error: updateError } = await supabase
      .from('subitem_templates')
      .update({
        title: settingsTemplateTitle.trim(),
      })
      .eq('id', selectedSettingsTemplateId)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadSubItemTemplates()
  }

  const deleteSelectedTemplate = async () => {
    setError('')

    if (!selectedSettingsTemplate) {
      setError('削除する項目内項目を一覧から選択してください。')
      return
    }

    const confirmed = window.confirm(`項目内項目「${selectedSettingsTemplate.title}」を削除しますか？`)
    if (!confirmed) return

    const { error: deleteError } = await supabase
      .from('subitem_templates')
      .delete()
      .eq('id', selectedSettingsTemplate.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setSelectedSettingsTemplateId(null)
    await loadSubItemTemplates()
  }

  const addSubItemFromTemplate = async (template: SubItemTemplateRow) => {
    setError('')

    if (!selectedItemId) {
      setError('先に親項目を選択してください。')
      return
    }

    const nextSortOrder =
      subItems.length === 0 ? 0 : Math.max(...subItems.map((subItem) => subItem.sort_order)) + 1

    const { error: insertError } = await supabase.from('threads').insert({
      node_id: selectedItemId,
      title: template.title,
      scheduled_on: mainScheduledOn || null,
      tags: uniqueStrings(mainSelectedTags),
      body: '',
      sort_order: nextSortOrder,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    await loadSubItems(selectedItemId)
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
              onClick={() => setPageMode((current) => (current === 'main' ? 'settings' : 'main'))}
            >
              {pageMode === 'main' ? '設定' : '戻る'}
            </button>
          </div>

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

        {pageMode === 'settings' ? (
          <section className="panel content-panel settings-page">
            <h2>設定</h2>

            <section className="settings-section">
              <h3>項目内項目設定</h3>
              <div className="template-button-list">
                {subItemTemplates.length === 0 ? (
                  <p className="subtle">項目内項目はまだありません</p>
                ) : (
                  subItemTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`ghost-button template-button ${
                        selectedSettingsTemplateId === template.id ? 'active' : ''
                      }`}
                      onClick={() => setSelectedSettingsTemplateId(template.id)}
                    >
                      {template.title}
                    </button>
                  ))
                )}
              </div>
              <label>
                項目内項目名
                <input
                  value={settingsTemplateTitle}
                  onChange={(event) => setSettingsTemplateTitle(event.target.value)}
                  placeholder="例: 導入シーン"
                />
              </label>
              <div className="settings-template-actions">
                <button type="button" onClick={createTemplateFromSettings}>
                  項目内項目追加
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={updateSelectedTemplate}
                  disabled={!selectedSettingsTemplateId}
                >
                  選択更新
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={deleteSelectedTemplate}
                  disabled={!selectedSettingsTemplateId}
                >
                  選択削除
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h3>項目タグ設定</h3>
              <div className="template-button-list">
                {tagPresets.length === 0 ? (
                  <p className="subtle">タグはまだありません</p>
                ) : (
                  tagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button template-button ${
                        selectedSettingsTagId === tag.id ? 'active' : ''
                      }`}
                      onClick={() => setSelectedSettingsTagId(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
              <label>
                項目タグ名
                <input
                  value={settingsTagName}
                  onChange={(event) => setSettingsTagName(event.target.value)}
                  placeholder="例: 感動"
                />
              </label>
              <div className="settings-template-actions">
                <button type="button" onClick={createTagPresetFromSettings}>
                  タグ追加
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={updateSelectedTagFromSettings}
                  disabled={!selectedSettingsTagId}
                >
                  選択更新
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={deleteSelectedTagFromSettings}
                  disabled={!selectedSettingsTagId}
                >
                  選択削除
                </button>
              </div>
            </section>

            <div className="settings-footer">
              <button type="button" className="danger-button settings-logout" onClick={logout}>
                ログアウト
              </button>
            </div>
          </section>
        ) : (
          <section className="panel content-panel">
            <div className="content-head">
              <h2>{selectedItem ? `項目: ${selectedItem.title}` : '項目を選択してください'}</h2>
              <p className="subtle">
                {selectedItem
                  ? '下の順番で項目内項目の一覧確認と追加ができます。'
                  : '左の一覧から項目を選ぶか、新しく作成してください。'}
              </p>
            </div>

            <section className="main-section">
              <h3>項目内項目一覧</h3>
              <div className="subitem-list">
                {selectedItemId ? (
                  subItems.length === 0 ? (
                    <p className="subtle">まだ項目内項目がありません</p>
                  ) : (
                    subItems.map((subItem, index) => (
                      <article key={subItem.id} className="subitem-card">
                        <header className="subitem-header">
                          <div>
                            <h3>{subItem.title}</h3>
                            <p className="subtle">{subItem.scheduled_on || '日付未設定'}</p>
                          </div>
                          <div className="subitem-actions">
                            <button
                              type="button"
                              className="ghost-button mini-action"
                              onClick={() => void moveSubItem(subItem.id, 'up')}
                              disabled={index === 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="ghost-button mini-action"
                              onClick={() => void moveSubItem(subItem.id, 'down')}
                              disabled={index === subItems.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="danger-button mini-action"
                              onClick={() => void deleteSubItem(subItem)}
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
            </section>

            <section className="main-section">
              <h3>日付</h3>
              <input
                type="date"
                value={mainScheduledOn}
                onChange={(event) => setMainScheduledOn(event.target.value)}
                disabled={!selectedItemId}
              />
            </section>

            <section className="main-section">
              <h3>項目タグ</h3>
              <div className="tag-picker">
                {tagPresets.length === 0 ? (
                  <p className="subtle">タグがありません。下から追加できます</p>
                ) : (
                  tagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button tag-preset-button ${
                        mainSelectedTags.includes(tag.name) ? 'active' : ''
                      }`}
                      onClick={() => toggleMainTag(tag.name)}
                      disabled={!selectedItemId}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
              <div className="main-create-row">
                <input
                  value={mainNewTagName}
                  onChange={(event) => setMainNewTagName(event.target.value)}
                  placeholder="新しいタグ名"
                  disabled={!selectedItemId}
                />
                <button type="button" onClick={addTagPresetFromMain} disabled={!selectedItemId}>
                  タグ追加
                </button>
              </div>
            </section>

            <section className="main-section subitem-form">
              <h3>項目内項目追加</h3>
              <div className="main-create-row">
                <input
                  value={mainTemplateTitle}
                  onChange={(event) => setMainTemplateTitle(event.target.value)}
                  placeholder="新しい項目内項目名"
                  disabled={!selectedItemId}
                />
                <button type="button" onClick={createTemplateFromMain} disabled={!selectedItemId}>
                  項目内項目を追加
                </button>
              </div>
              <div className="template-button-list">
                {subItemTemplates.length === 0 ? (
                  <p className="subtle">項目内項目がありません。上から追加できます</p>
                ) : (
                  subItemTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="ghost-button template-button"
                      onClick={() => void addSubItemFromTemplate(template)}
                      disabled={!selectedItemId}
                    >
                      {template.title}
                    </button>
                  ))
                )}
              </div>
            </section>
          </section>
        )}
      </section>
    </main>
  )
}

export default App

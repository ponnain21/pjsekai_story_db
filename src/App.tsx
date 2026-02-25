import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type ItemRow = {
  id: string
  title: string
  scheduled_on: string | null
  tags: string[] | null
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

type PresetDialogState = {
  kind: 'template' | 'tag'
  mode: 'create' | 'edit'
  id: string | null
}

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
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
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null)

  const [itemTitle, setItemTitle] = useState('')
  const [renameItemTitle, setRenameItemTitle] = useState('')

  const [mainScheduledOn, setMainScheduledOn] = useState('')
  const [mainSelectedTags, setMainSelectedTags] = useState<string[]>([])
  const [mainSelectedTemplateIds, setMainSelectedTemplateIds] = useState<string[]>([])
  const [subItemBodyDraft, setSubItemBodyDraft] = useState('')
  const [presetDialog, setPresetDialog] = useState<PresetDialogState | null>(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedSubItem = subItems.find((subItem) => subItem.id === selectedSubItemId) ?? null

  useEffect(() => {
    setRenameItemTitle(selectedItem?.title ?? '')
  }, [selectedItem?.id, selectedItem?.title])

  useEffect(() => {
    setMainScheduledOn(selectedItem?.scheduled_on ?? '')
    setMainSelectedTags(uniqueStrings(selectedItem?.tags ?? []))
  }, [selectedItem?.id, selectedItem?.scheduled_on, selectedItem?.tags])

  useEffect(() => {
    setSubItemBodyDraft(selectedSubItem?.body ?? '')
  }, [selectedSubItem?.id, selectedSubItem?.body])

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
    const applyLoadedItems = (loadedItems: ItemRow[]) => {
      setItems(loadedItems)
      setSelectedItemId((current) => {
        if (current && loadedItems.some((item) => item.id === current)) return current
        return loadedItems[0]?.id ?? null
      })
    }

    const { data, error: loadError } = await supabase
      .from('nodes')
      .select('id, title, scheduled_on, tags, created_at')
      .is('parent_id', null)
      .order('created_at', { ascending: true })

    if (loadError) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('nodes')
        .select('id, title, created_at')
        .is('parent_id', null)
        .order('created_at', { ascending: true })

      if (legacyError) {
        setError(loadError.message)
        return
      }

      const fallbackItems = ((legacyData ?? []) as Omit<ItemRow, 'scheduled_on' | 'tags'>[]).map((item) => ({
        ...item,
        scheduled_on: null,
        tags: [],
      }))
      applyLoadedItems(fallbackItems)
      return
    }

    applyLoadedItems((data ?? []) as ItemRow[])
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
      .select('id, title, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    const loadedTemplates = (data ?? []) as SubItemTemplateRow[]
    setSubItemTemplates(loadedTemplates)
    setSelectedSettingsTemplateId((current) => {
      if (current && loadedTemplates.some((template) => template.id === current)) return current
      return null
    })
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
      return null
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
      setSelectedSubItemId(null)
      return
    }
    void loadItems()
    void loadSubItemTemplates()
    void loadTagPresets()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      setSelectedSubItemId(null)
      setMainSelectedTemplateIds([])
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

    const { error: deleteError } = await supabase.from('nodes').delete().eq('id', selectedItem.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadItems()
  }

  const saveItemMeta = async (scheduledOn: string, tags: string[]) => {
    if (!selectedItemId) return

    const { error: updateError } = await supabase
      .from('nodes')
      .update({
        scheduled_on: scheduledOn || null,
        tags: uniqueStrings(tags),
      })
      .eq('id', selectedItemId)

    if (updateError) {
      if (updateError.message.includes('scheduled_on') || updateError.message.includes('tags')) {
        setError('nodes テーブルに scheduled_on / tags 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(updateError.message)
      }
      return
    }

    await loadItems()
  }

  const handleMainDateChange = async (value: string) => {
    setMainScheduledOn(value)
    await saveItemMeta(value, mainSelectedTags)
  }

  const openConfirmDialog = (dialog: ConfirmDialogState) => {
    setConfirmDialog(dialog)
  }

  const executeConfirmDialog = async () => {
    if (!confirmDialog || dialogBusy) return
    setDialogBusy(true)
    try {
      await confirmDialog.onConfirm()
      setConfirmDialog(null)
    } finally {
      setDialogBusy(false)
    }
  }

  const openCreatePresetDialog = (kind: 'template' | 'tag') => {
    setPresetNameDraft('')
    setPresetDialog({ kind, mode: 'create', id: null })
  }

  const openEditPresetDialog = (kind: 'template' | 'tag', id: string) => {
    if (kind === 'template') {
      const template = subItemTemplates.find((current) => current.id === id)
      if (!template) return
      setSelectedSettingsTemplateId(template.id)
      setPresetNameDraft(template.title)
      setPresetDialog({ kind: 'template', mode: 'edit', id: template.id })
      return
    }

    const tag = tagPresets.find((current) => current.id === id)
    if (!tag) return
    setSelectedSettingsTagId(tag.id)
    setPresetNameDraft(tag.name)
    setPresetDialog({ kind: 'tag', mode: 'edit', id: tag.id })
  }

  const submitPresetDialog = async () => {
    if (!presetDialog || dialogBusy) return
    setError('')

    const trimmed = presetNameDraft.trim()
    if (!trimmed) {
      setError('名称を入力してください。')
      return
    }

    setDialogBusy(true)
    try {
      if (presetDialog.kind === 'template') {
        if (presetDialog.mode === 'create') {
          const { data, error: insertError } = await supabase
            .from('subitem_templates')
            .insert({
              title: trimmed,
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
        } else {
          if (!presetDialog.id) {
            setError('更新する項目内項目が見つかりません。')
            return
          }
          const { error: updateError } = await supabase
            .from('subitem_templates')
            .update({ title: trimmed })
            .eq('id', presetDialog.id)
          if (updateError) {
            setError(updateError.message)
            return
          }
          await loadSubItemTemplates()
        }
      } else {
        if (presetDialog.mode === 'create') {
          const { data, error: insertError } = await supabase
            .from('subitem_tag_presets')
            .upsert({ name: trimmed }, { onConflict: 'name' })
            .select('id')
            .single()
          if (insertError) {
            setError(insertError.message)
            return
          }
          await loadTagPresets()
          if (data?.id) setSelectedSettingsTagId(data.id)
        } else {
          if (!presetDialog.id) {
            setError('更新するタグが見つかりません。')
            return
          }
          const { error: updateError } = await supabase
            .from('subitem_tag_presets')
            .update({ name: trimmed })
            .eq('id', presetDialog.id)
          if (updateError) {
            setError(updateError.message)
            return
          }
          await loadTagPresets()
        }
      }

      setPresetDialog(null)
    } finally {
      setDialogBusy(false)
    }
  }

  const requestDeleteFromPresetDialog = () => {
    if (!presetDialog || presetDialog.mode !== 'edit' || !presetDialog.id) return

    if (presetDialog.kind === 'template') {
      const template = subItemTemplates.find((current) => current.id === presetDialog.id)
      if (!template) return
      openConfirmDialog({
        title: '項目内項目の削除',
        message: `「${template.title}」を削除します。`,
        confirmLabel: '削除する',
        onConfirm: async () => {
          const { error: deleteError } = await supabase.from('subitem_templates').delete().eq('id', template.id)
          if (deleteError) {
            setError(deleteError.message)
            return
          }
          await loadSubItemTemplates()
          setPresetDialog(null)
        },
      })
      return
    }

    const tag = tagPresets.find((current) => current.id === presetDialog.id)
    if (!tag) return
    openConfirmDialog({
      title: 'タグの削除',
      message: `「${tag.name}」を削除します。`,
      confirmLabel: '削除する',
      onConfirm: async () => {
        const { error: deleteError } = await supabase.from('subitem_tag_presets').delete().eq('id', tag.id)
        if (deleteError) {
          setError(deleteError.message)
          return
        }
        await loadTagPresets()
        const nextTags = mainSelectedTags.filter((name) => name !== tag.name)
        setMainSelectedTags(nextTags)
        await saveItemMeta(mainScheduledOn, nextTags)
        setPresetDialog(null)
      },
    })
  }

  const handleSettingsTemplateButton = (template: SubItemTemplateRow) => {
    if (selectedSettingsTemplateId === template.id) {
      openEditPresetDialog('template', template.id)
      return
    }
    setSelectedSettingsTemplateId(template.id)
  }

  const handleMainTemplateButton = (template: SubItemTemplateRow) => {
    if (mainSelectedTemplateIds.includes(template.id)) {
      openEditPresetDialog('template', template.id)
      return
    }
    setSelectedSettingsTemplateId(template.id)
    setMainSelectedTemplateIds((current) => uniqueStrings([...current, template.id]))
  }

  const removeMainTemplateSelection = (templateId: string) => {
    setMainSelectedTemplateIds((current) => current.filter((id) => id !== templateId))
  }

  const addSelectedTemplatesToItem = async () => {
    setError('')

    if (!selectedItemId) {
      setError('先に親項目を選択してください。')
      return
    }
    if (mainSelectedTemplateIds.length === 0) {
      setError('追加する項目内項目を選択してください。')
      return
    }

    const selectedTemplates = mainSelectedTemplateIds
      .map((templateId) => subItemTemplates.find((template) => template.id === templateId))
      .filter((template): template is SubItemTemplateRow => Boolean(template))

    if (selectedTemplates.length === 0) {
      setError('選択中の項目内項目が見つかりません。')
      return
    }

    const baseSortOrder =
      subItems.length === 0 ? 0 : Math.max(...subItems.map((subItem) => subItem.sort_order)) + 1
    const payload = selectedTemplates.map((template, index) => ({
      node_id: selectedItemId,
      title: template.title,
      scheduled_on: null,
      tags: [],
      body: '',
      sort_order: baseSortOrder + index,
    }))

    const { error: insertError } = await supabase.from('threads').insert(payload)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setMainSelectedTemplateIds([])
    await loadSubItems(selectedItemId)
  }

  const removeMainTag = async (name: string) => {
    const nextTags = mainSelectedTags.filter((tag) => tag !== name)
    setMainSelectedTags(nextTags)
    await saveItemMeta(mainScheduledOn, nextTags)
  }

  const handleSettingsTagButton = (tag: TagPresetRow) => {
    if (selectedSettingsTagId === tag.id) {
      openEditPresetDialog('tag', tag.id)
      return
    }
    setSelectedSettingsTagId(tag.id)
  }

  const handleMainTagButton = async (tag: TagPresetRow) => {
    if (mainSelectedTags.includes(tag.name)) {
      if (selectedSettingsTagId === tag.id) {
        openEditPresetDialog('tag', tag.id)
        return
      }
      setSelectedSettingsTagId(tag.id)
      return
    }

    const nextTags = uniqueStrings([...mainSelectedTags, tag.name])
    setMainSelectedTags(nextTags)
    setSelectedSettingsTagId(tag.id)
    await saveItemMeta(mainScheduledOn, nextTags)
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

    const { error: deleteError } = await supabase.from('threads').delete().eq('id', subItem.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    if (selectedItemId) await loadSubItems(selectedItemId)
  }

  const saveSelectedSubItemBody = async () => {
    setError('')
    if (!selectedSubItem) {
      setError('本文を保存する項目内項目を選択してください。')
      return
    }

    const { error: updateError } = await supabase
      .from('threads')
      .update({ body: subItemBodyDraft })
      .eq('id', selectedSubItem.id)

    if (updateError) {
      setError(updateError.message)
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
                onClick={() =>
                  openConfirmDialog({
                    title: '項目の削除',
                    message: selectedItem ? `「${selectedItem.title}」を削除します。` : '項目を削除します。',
                    confirmLabel: '削除する',
                    onConfirm: deleteSelectedItem,
                  })
                }
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
              <p className="subtle">同じボタンをもう一度押すと詳細ウインドウを開きます。</p>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('template')}>
                ＋ 項目内項目を作成
              </button>
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
                      onClick={() => handleSettingsTemplateButton(template)}
                    >
                      {template.title}
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="settings-section">
              <h3>項目タグ設定</h3>
              <p className="subtle">同じボタンをもう一度押すと詳細ウインドウを開きます。</p>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('tag')}>
                ＋ タグを作成
              </button>
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
                      onClick={() => handleSettingsTagButton(tag)}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
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
                  ? '構造: 項目内項目 -> 本文、項目 -> 日付/項目タグ'
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
                      <article
                        key={subItem.id}
                        className={`subitem-card ${selectedSubItemId === subItem.id ? 'active' : ''}`}
                      >
                        <header className="subitem-header">
                          <button
                            type="button"
                            className="subitem-select"
                            onClick={() => setSelectedSubItemId(subItem.id)}
                          >
                            {subItem.title}
                          </button>
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
                              onClick={() =>
                                openConfirmDialog({
                                  title: '項目内項目の削除',
                                  message: `「${subItem.title}」を削除します。`,
                                  confirmLabel: '削除する',
                                  onConfirm: async () => {
                                    await deleteSubItem(subItem)
                                  },
                                })
                              }
                            >
                              削除
                            </button>
                          </div>
                        </header>
                      </article>
                    ))
                  )
                ) : (
                  <p className="subtle">項目を選択するとここにデータが表示されます</p>
                )}
              </div>
            </section>

            <section className="main-section">
              <h3>本文</h3>
              {selectedSubItem ? (
                <>
                  <p className="subtle">選択中: {selectedSubItem.title}</p>
                  <textarea
                    className="body-editor"
                    value={subItemBodyDraft}
                    onChange={(event) => setSubItemBodyDraft(event.target.value)}
                    placeholder="ここに本文を入力"
                  />
                  <button type="button" onClick={saveSelectedSubItemBody}>
                    本文を保存
                  </button>
                </>
              ) : (
                <p className="subtle">本文を編集する項目内項目を一覧から選択してください</p>
              )}
            </section>

            <section className="main-section">
              <h3>日付</h3>
              <input
                type="date"
                value={mainScheduledOn}
                onChange={(event) => void handleMainDateChange(event.target.value)}
                disabled={!selectedItemId}
              />
            </section>

            <section className="main-section">
              <h3>項目タグ</h3>
              <p className="subtle">選択中タグを再クリックすると、タグ設定ウインドウを開きます。</p>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('tag')}>
                ＋ タグを作成
              </button>
              <div className="tag-picker">
                {tagPresets.length === 0 ? (
                  <p className="subtle">タグがありません。上のボタンで作成してください</p>
                ) : (
                  tagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button tag-preset-button ${
                        mainSelectedTags.includes(tag.name) ? 'active' : ''
                      }`}
                      onClick={() => void handleMainTagButton(tag)}
                      disabled={!selectedItemId}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
              {mainSelectedTags.length > 0 && (
                <div className="selected-tag-list">
                  {mainSelectedTags.map((tagName) => (
                    <button
                      key={tagName}
                      type="button"
                      className="selected-tag-chip"
                      onClick={() => void removeMainTag(tagName)}
                    >
                      {tagName} ×
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="main-section subitem-form">
              <h3>項目内項目追加</h3>
              <p className="subtle">複数選択して一括追加できます。選択済みを再クリックすると詳細ウインドウを開きます。</p>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('template')}>
                ＋ 項目内項目を作成
              </button>
              <div className="template-button-list">
                {subItemTemplates.length === 0 ? (
                  <p className="subtle">項目内項目がありません。上のボタンで作成してください</p>
                ) : (
                  subItemTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`ghost-button template-button ${
                        mainSelectedTemplateIds.includes(template.id) ? 'active' : ''
                      }`}
                      onClick={() => void handleMainTemplateButton(template)}
                      disabled={!selectedItemId}
                    >
                      {template.title}
                    </button>
                  ))
                )}
              </div>
              {mainSelectedTemplateIds.length > 0 && (
                <div className="selected-template-list">
                  {mainSelectedTemplateIds.map((templateId) => {
                    const templateName = subItemTemplates.find((template) => template.id === templateId)?.title ?? templateId
                    return (
                      <button
                        key={templateId}
                        type="button"
                        className="selected-template-chip"
                        onClick={() => removeMainTemplateSelection(templateId)}
                      >
                        {templateName} ×
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={addSelectedTemplatesToItem}
                disabled={!selectedItemId || mainSelectedTemplateIds.length === 0}
              >
                選択した項目内項目を追加
              </button>
            </section>
          </section>
        )}
      </section>

      {presetDialog && (
        <div className="overlay">
          <section className="dialog-panel">
            <h2>
              {presetDialog.kind === 'template'
                ? presetDialog.mode === 'create'
                  ? '項目内項目を作成'
                  : '項目内項目の詳細設定'
                : presetDialog.mode === 'create'
                  ? 'タグを作成'
                  : 'タグの詳細設定'}
            </h2>
            <label className="dialog-field">
              名称
              <input
                value={presetNameDraft}
                onChange={(event) => setPresetNameDraft(event.target.value)}
                placeholder="名称を入力"
                disabled={dialogBusy}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPresetDialog(null)}
                disabled={dialogBusy}
              >
                閉じる
              </button>
              {presetDialog.mode === 'edit' && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={requestDeleteFromPresetDialog}
                  disabled={dialogBusy}
                >
                  削除
                </button>
              )}
              <button type="button" onClick={submitPresetDialog} disabled={dialogBusy}>
                {presetDialog.mode === 'create' ? '作成' : '保存'}
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <div className="overlay">
          <section className="dialog-panel dialog-confirm">
            <h2>{confirmDialog.title}</h2>
            <p className="subtle">{confirmDialog.message}</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setConfirmDialog(null)}
                disabled={dialogBusy}
              >
                キャンセル
              </button>
              <button type="button" className="danger-button" onClick={executeConfirmDialog} disabled={dialogBusy}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App

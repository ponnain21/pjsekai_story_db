import { useEffect, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type ItemRow = {
  id: string
  title: string
  scheduled_on: string | null
  tags: string[] | null
  sort_order: number
  created_at: string
}

type SubItemRow = {
  id: string
  node_id: string
  title: string
  has_episodes: boolean
  scheduled_on: string | null
  tags: string[] | null
  body: string
  sort_order: number
  created_at: string
}

type EpisodeRow = {
  id: string
  thread_id: string
  title: string
  body: string
  sort_order: number
  created_at: string
}

type SubItemTemplateRow = {
  id: string
  title: string
  sort_order: number
  created_at: string
}

type TagPresetRow = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

type FilterTermRow = {
  id: string
  term: string
  created_at: string
}

type SpeakerProfileRow = {
  id: string
  name: string
  icon_url: string | null
  created_at: string
}

type ParsedLineRow = {
  kind: 'dialogue' | 'direction'
  speaker: string
  content: string
}

type SortableKind = 'item' | 'subitem' | 'episode' | 'template' | 'tag'

type PresetDialogState = {
  kind: 'item' | 'template' | 'tag'
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

const isMissingRelationError = (message: string) =>
  message.includes('relation') && message.includes('does not exist')

const splitAndFilterLines = (rawText: string, blockedTerms: Set<string>) => {
  const normalizedLines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())

  let nonEmptyIndex = -1
  return normalizedLines.filter((line) => {
    if (!line) return false
    nonEmptyIndex += 1

    if (nonEmptyIndex < 2) {
      const lowerLine = line.toLowerCase()
      if (lowerLine.includes('sekai viewer') || lowerLine.includes('sekai vieweri') || line === '機能一覧') {
        return false
      }
    }

    return !blockedTerms.has(line)
  })
}

const isLikelySpeakerLine = (line: string, nextLine: string | undefined, knownSpeakers: Set<string>) => {
  if (!line) return false
  if (knownSpeakers.has(line)) return true
  if (!nextLine) return false
  if (line.length > 20) return false
  if (/[。、，．!?！？]/.test(line)) return false
  if (/\s/.test(line)) return false
  if (/^[0-9０-９\-〜～]+$/.test(line)) return false
  return true
}

const parseScriptLines = (
  rawText: string,
  blockedTerms: string[],
  speakerNames: string[],
) => {
  const blockedSet = new Set(blockedTerms.map((term) => term.trim()).filter(Boolean))
  const knownSpeakers = new Set(speakerNames.map((name) => name.trim()).filter(Boolean))
  const lines = splitAndFilterLines(rawText, blockedSet)
  const rows: ParsedLineRow[] = []
  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    const nextNextLine = lines[index + 2]
    const lineIsSpeaker = isLikelySpeakerLine(line, nextLine, knownSpeakers)
    const nextIsSpeaker = nextLine ? isLikelySpeakerLine(nextLine, nextNextLine, knownSpeakers) : false

    if (lineIsSpeaker && nextLine && !nextIsSpeaker) {
      rows.push({
        kind: 'dialogue',
        speaker: line,
        content: nextLine,
      })
      index += 2
      continue
    }

    rows.push({
      kind: 'direction',
      speaker: '',
      content: line,
    })
    index += 1
  }

  return rows
}

const FallbackSpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
  </svg>
)

const reorderRowsByIds = <T extends { id: string; sort_order: number }>(
  rows: T[],
  draggedId: string,
  targetId: string,
) => {
  const fromIndex = rows.findIndex((row) => row.id === draggedId)
  const toIndex = rows.findIndex((row) => row.id === targetId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return rows

  const next = [...rows]
  const [dragged] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, dragged)
  return next.map((row, index) => ({ ...row, sort_order: index }))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'denied'>(
    'unknown',
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')

  const [pageMode, setPageMode] = useState<'main' | 'settings' | 'subitemBody'>('main')

  const [items, setItems] = useState<ItemRow[]>([])
  const [subItems, setSubItems] = useState<SubItemRow[]>([])
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([])
  const [subItemTemplates, setSubItemTemplates] = useState<SubItemTemplateRow[]>([])
  const [tagPresets, setTagPresets] = useState<TagPresetRow[]>([])
  const [filterTerms, setFilterTerms] = useState<FilterTermRow[]>([])
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfileRow[]>([])

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedSettingsTemplateId, setSelectedSettingsTemplateId] = useState<string | null>(null)
  const [selectedSettingsTagId, setSelectedSettingsTagId] = useState<string | null>(null)
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)

  const [itemTitle, setItemTitle] = useState('')

  const [mainScheduledOn, setMainScheduledOn] = useState('')
  const [mainSelectedTags, setMainSelectedTags] = useState<string[]>([])
  const [mainSelectedTemplateIds, setMainSelectedTemplateIds] = useState<string[]>([])
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [subItemBodyDraft, setSubItemBodyDraft] = useState('')
  const [filterTermDraft, setFilterTermDraft] = useState('')
  const [speakerNameDraft, setSpeakerNameDraft] = useState('')
  const [speakerIconUrlDraft, setSpeakerIconUrlDraft] = useState('')
  const [speakerIconFile, setSpeakerIconFile] = useState<File | null>(null)
  const [editingSpeakerProfileId, setEditingSpeakerProfileId] = useState<string | null>(null)
  const [parsedLines, setParsedLines] = useState<ParsedLineRow[]>([])
  const [presetDialog, setPresetDialog] = useState<PresetDialogState | null>(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dragState, setDragState] = useState<{ kind: SortableKind; id: string } | null>(null)

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedSubItem = subItems.find((subItem) => subItem.id === selectedSubItemId) ?? null
  const selectedEpisode = episodes.find((episode) => episode.id === selectedEpisodeId) ?? null

  useEffect(() => {
    setMainScheduledOn(selectedItem?.scheduled_on ?? '')
    setMainSelectedTags(uniqueStrings(selectedItem?.tags ?? []))
  }, [selectedItem?.id, selectedItem?.scheduled_on, selectedItem?.tags])

  useEffect(() => {
    if (selectedSubItem?.has_episodes) {
      setSubItemBodyDraft(selectedEpisode?.body ?? '')
      setParsedLines([])
      return
    }
    setSubItemBodyDraft(selectedSubItem?.body ?? '')
    setParsedLines([])
  }, [selectedSubItem?.id, selectedSubItem?.has_episodes, selectedSubItem?.body, selectedEpisode?.id, selectedEpisode?.body])

  useEffect(() => {
    if (pageMode === 'subitemBody' && !selectedSubItemId) {
      setPageMode('main')
    }
  }, [pageMode, selectedSubItemId])

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
      .select('id, title, scheduled_on, tags, sort_order, created_at')
      .is('parent_id', null)
      .order('scheduled_on', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
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

      const fallbackItems = ((legacyData ?? []) as Omit<ItemRow, 'scheduled_on' | 'tags' | 'sort_order'>[]).map(
        (item) => ({
        ...item,
        scheduled_on: null,
        tags: [],
        sort_order: 0,
        }),
      )
      applyLoadedItems(fallbackItems)
      return
    }

    applyLoadedItems((data ?? []) as ItemRow[])
  }

  const loadSubItems = async (itemId: string) => {
    const { data, error: loadError } = await supabase
      .from('threads')
      .select('id, node_id, title, has_episodes, scheduled_on, tags, body, sort_order, created_at')
      .eq('node_id', itemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('threads')
        .select('id, node_id, title, scheduled_on, tags, body, sort_order, created_at')
        .eq('node_id', itemId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (legacyError) {
        setError(loadError.message)
        return
      }

      const fallbackSubItems = ((legacyData ?? []) as Omit<SubItemRow, 'has_episodes'>[]).map((subItem) => ({
        ...subItem,
        has_episodes: false,
      }))
      setSubItems(fallbackSubItems)
      setSelectedSubItemId((current) => {
        if (current && fallbackSubItems.some((subItem) => subItem.id === current)) return current
        return fallbackSubItems[0]?.id ?? null
      })
      return
    }

    const loadedSubItems = (data ?? []) as SubItemRow[]
    setSubItems(loadedSubItems)
    setSelectedSubItemId((current) => {
      if (current && loadedSubItems.some((subItem) => subItem.id === current)) return current
      return loadedSubItems[0]?.id ?? null
    })
  }

  const loadEpisodes = async (subItemId: string) => {
    const { data, error: loadError } = await supabase
      .from('subitem_episodes')
      .select('id, thread_id, title, body, sort_order, created_at')
      .eq('thread_id', subItemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    const loadedEpisodes = (data ?? []) as EpisodeRow[]
    setEpisodes(loadedEpisodes)
    setSelectedEpisodeId((current) => {
      if (current && loadedEpisodes.some((episode) => episode.id === current)) return current
      return loadedEpisodes[0]?.id ?? null
    })
  }

  const loadSubItemTemplates = async () => {
    const applyLoadedTemplates = (loadedTemplates: SubItemTemplateRow[]) => {
      setSubItemTemplates(loadedTemplates)
      setSelectedSettingsTemplateId((current) => {
        if (current && loadedTemplates.some((template) => template.id === current)) return current
        return null
      })
    }

    const { data, error: loadError } = await supabase
      .from('subitem_templates')
      .select('id, title, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('subitem_templates')
        .select('id, title, created_at')
        .order('created_at', { ascending: true })

      if (legacyError) {
        setError(loadError.message)
        return
      }

      const fallbackTemplates = ((legacyData ?? []) as Omit<SubItemTemplateRow, 'sort_order'>[]).map((template) => ({
        ...template,
        sort_order: 0,
      }))
      applyLoadedTemplates(fallbackTemplates)
      return
    }

    applyLoadedTemplates((data ?? []) as SubItemTemplateRow[])
  }

  const loadTagPresets = async () => {
    const applyLoadedTags = (loadedTags: TagPresetRow[]) => {
      setTagPresets(loadedTags)
      setSelectedSettingsTagId((current) => {
        if (current && loadedTags.some((tag) => tag.id === current)) return current
        return null
      })
    }

    const { data, error: loadError } = await supabase
      .from('subitem_tag_presets')
      .select('id, name, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('subitem_tag_presets')
        .select('id, name, created_at')
        .order('created_at', { ascending: true })

      if (legacyError) {
        setError(loadError.message)
        return
      }

      const fallbackTags = ((legacyData ?? []) as Omit<TagPresetRow, 'sort_order'>[]).map((tag) => ({
        ...tag,
        sort_order: 0,
      }))
      applyLoadedTags(fallbackTags)
      return
    }

    applyLoadedTags((data ?? []) as TagPresetRow[])
  }

  const loadFilterTerms = async () => {
    const { data, error: loadError } = await supabase
      .from('parser_filter_terms')
      .select('id, term, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setFilterTerms([])
        return
      }
      setError(loadError.message)
      return
    }

    setFilterTerms((data ?? []) as FilterTermRow[])
  }

  const loadSpeakerProfiles = async () => {
    const { data, error: loadError } = await supabase
      .from('speaker_profiles')
      .select('id, name, icon_url, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setSpeakerProfiles([])
        return
      }
      setError(loadError.message)
      return
    }

    setSpeakerProfiles((data ?? []) as SpeakerProfileRow[])
  }

  useEffect(() => {
    if (!session || accessStatus !== 'allowed') {
      setItems([])
      setSubItems([])
      setEpisodes([])
      setSubItemTemplates([])
      setTagPresets([])
      setFilterTerms([])
      setSpeakerProfiles([])
      setSelectedItemId(null)
      setSelectedSettingsTemplateId(null)
      setSelectedSettingsTagId(null)
      setSelectedSubItemId(null)
      setSelectedEpisodeId(null)
      setEditingSpeakerProfileId(null)
      setParsedLines([])
      return
    }
    void loadItems()
    void loadSubItemTemplates()
    void loadTagPresets()
    void loadFilterTerms()
    void loadSpeakerProfiles()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      setEpisodes([])
      setSelectedSubItemId(null)
      setSelectedEpisodeId(null)
      setMainSelectedTemplateIds([])
      return
    }
    void loadSubItems(selectedItemId)
  }, [selectedItemId])

  useEffect(() => {
    if (!selectedSubItemId || !selectedSubItem?.has_episodes) {
      setEpisodes([])
      setSelectedEpisodeId(null)
      return
    }
    void loadEpisodes(selectedSubItemId)
  }, [selectedSubItemId, selectedSubItem?.has_episodes])

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

    const nextSortOrder = items.length === 0 ? 0 : Math.max(...items.map((item) => item.sort_order)) + 1

    const { error: insertError } = await supabase.from('nodes').insert({
      type: 'game',
      title: itemTitle.trim(),
      parent_id: null,
      sort_order: nextSortOrder,
    })

    if (insertError) {
      if (insertError.message.includes('sort_order')) {
        setError('sort_order 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(insertError.message)
      }
      return
    }

    setItemTitle('')
    await loadItems()
  }

  const deleteItemById = async (itemId: string) => {
    setError('')
    const item = items.find((current) => current.id === itemId)
    if (!item) {
      setError('削除対象の項目が見つかりません。')
      return
    }

    const { error: deleteError } = await supabase.from('nodes').delete().eq('id', item.id)
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

  const persistSortOrder = async (
    table: 'nodes' | 'threads' | 'subitem_episodes' | 'subitem_templates' | 'subitem_tag_presets',
    orderedIds: string[],
  ) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index]
      const { error: updateError } = await supabase
        .from(table)
        .update({ sort_order: index })
        .eq('id', id)

      if (updateError) {
        if (updateError.message.includes('sort_order')) {
          setError('sort_order 列が必要です。supabase/schema.sql を実行してください。')
        } else {
          setError(updateError.message)
        }
        return false
      }
    }

    return true
  }

  const reorderItems = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(items, draggedId, targetId)
    setItems(reordered)
    const ok = await persistSortOrder(
      'nodes',
      reordered.map((row) => row.id),
    )
    if (!ok) await loadItems()
  }

  const reorderSubItems = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(subItems, draggedId, targetId)
    setSubItems(reordered)
    const ok = await persistSortOrder(
      'threads',
      reordered.map((row) => row.id),
    )
    if (!ok && selectedItemId) await loadSubItems(selectedItemId)
  }

  const reorderEpisodes = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(episodes, draggedId, targetId)
    setEpisodes(reordered)
    const ok = await persistSortOrder(
      'subitem_episodes',
      reordered.map((row) => row.id),
    )
    if (!ok && selectedSubItemId) await loadEpisodes(selectedSubItemId)
  }

  const reorderTemplates = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(subItemTemplates, draggedId, targetId)
    setSubItemTemplates(reordered)
    const ok = await persistSortOrder(
      'subitem_templates',
      reordered.map((row) => row.id),
    )
    if (!ok) await loadSubItemTemplates()
  }

  const reorderTags = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(tagPresets, draggedId, targetId)
    setTagPresets(reordered)
    const ok = await persistSortOrder(
      'subitem_tag_presets',
      reordered.map((row) => row.id),
    )
    if (!ok) await loadTagPresets()
  }

  const startSortDrag = (kind: SortableKind, id: string, event: DragEvent<HTMLElement>) => {
    setDragState({ kind, id })
    event.dataTransfer.effectAllowed = 'move'
  }

  const allowSortDrop = (kind: SortableKind, id: string, event: DragEvent<HTMLElement>) => {
    if (dragState && dragState.kind === kind && dragState.id !== id) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const dropSort = async (kind: SortableKind, targetId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!dragState || dragState.kind !== kind || dragState.id === targetId) return

    if (kind === 'item') await reorderItems(dragState.id, targetId)
    if (kind === 'subitem') await reorderSubItems(dragState.id, targetId)
    if (kind === 'episode') await reorderEpisodes(dragState.id, targetId)
    if (kind === 'template') await reorderTemplates(dragState.id, targetId)
    if (kind === 'tag') await reorderTags(dragState.id, targetId)

    setDragState(null)
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

  const openEditPresetDialog = (kind: 'item' | 'template' | 'tag', id: string) => {
    if (kind === 'item') {
      const item = items.find((current) => current.id === id)
      if (!item) return
      setSelectedItemId(item.id)
      setPresetNameDraft(item.title)
      setPresetDialog({ kind: 'item', mode: 'edit', id: item.id })
      return
    }

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
      if (presetDialog.kind === 'item') {
        if (!presetDialog.id) {
          setError('更新する項目が見つかりません。')
          return
        }
        const { error: updateError } = await supabase.from('nodes').update({ title: trimmed }).eq('id', presetDialog.id)
        if (updateError) {
          setError(updateError.message)
          return
        }
        await loadItems()
      } else if (presetDialog.kind === 'template') {
        if (presetDialog.mode === 'create') {
          const nextSortOrder =
            subItemTemplates.length === 0 ? 0 : Math.max(...subItemTemplates.map((template) => template.sort_order)) + 1
          const { data, error: insertError } = await supabase
            .from('subitem_templates')
            .insert({
              title: trimmed,
              scheduled_on: null,
              tags: [],
              body: '',
              sort_order: nextSortOrder,
            })
            .select('id')
            .single()
          if (insertError) {
            if (insertError.message.includes('sort_order')) {
              setError('sort_order 列が必要です。supabase/schema.sql を実行してください。')
            } else {
              setError(insertError.message)
            }
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
          const nextSortOrder = tagPresets.length === 0 ? 0 : Math.max(...tagPresets.map((tag) => tag.sort_order)) + 1
          const { data, error: insertError } = await supabase
            .from('subitem_tag_presets')
            .upsert({ name: trimmed, sort_order: nextSortOrder }, { onConflict: 'name' })
            .select('id')
            .single()
          if (insertError) {
            if (insertError.message.includes('sort_order')) {
              setError('sort_order 列が必要です。supabase/schema.sql を実行してください。')
            } else {
              setError(insertError.message)
            }
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

  const onSubmitPresetDialogForm = (event: FormEvent) => {
    event.preventDefault()
    void submitPresetDialog()
  }

  const requestDeleteFromPresetDialog = () => {
    if (!presetDialog || presetDialog.mode !== 'edit' || !presetDialog.id) return

    if (presetDialog.kind === 'item') {
      const item = items.find((current) => current.id === presetDialog.id)
      if (!item) return
      openConfirmDialog({
        title: '項目の削除',
        message: `「${item.title}」を削除します。`,
        confirmLabel: '削除する',
        onConfirm: async () => {
          await deleteItemById(item.id)
          setPresetDialog(null)
        },
      })
      return
    }

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

  const handleItemButton = (item: ItemRow) => {
    if (selectedItemId === item.id) {
      openEditPresetDialog('item', item.id)
      return
    }
    setSelectedItemId(item.id)
    if (pageMode === 'subitemBody') {
      setPageMode('main')
    }
  }

  const openSubItemBodyPage = (subItem: SubItemRow) => {
    setSelectedSubItemId(subItem.id)
    setPageMode('subitemBody')
  }

  const saveSubItemHasEpisodes = async (hasEpisodes: boolean) => {
    if (!selectedSubItem) return
    setError('')

    const { error: updateError } = await supabase
      .from('threads')
      .update({ has_episodes: hasEpisodes })
      .eq('id', selectedSubItem.id)

    if (updateError) {
      if (updateError.message.includes('has_episodes')) {
        setError('threads テーブルに has_episodes 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(updateError.message)
      }
      return
    }

    if (selectedItemId) await loadSubItems(selectedItemId)
    if (!hasEpisodes) {
      setEpisodes([])
      setSelectedEpisodeId(null)
    }
  }

  const addEpisode = async () => {
    if (!selectedSubItem) {
      setError('先に項目内項目を選択してください。')
      return
    }

    if (!selectedSubItem.has_episodes) {
      setError('まず「話あり」を選択してください。')
      return
    }

    const trimmedTitle = episodeTitle.trim()
    if (!trimmedTitle) {
      setError('話タイトルを入力してください。')
      return
    }

    const nextSortOrder = episodes.length === 0 ? 0 : Math.max(...episodes.map((episode) => episode.sort_order)) + 1
    const { data, error: insertError } = await supabase
      .from('subitem_episodes')
      .insert({
        thread_id: selectedSubItem.id,
        title: trimmedTitle,
        body: '',
        sort_order: nextSortOrder,
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setEpisodeTitle('')
    await loadEpisodes(selectedSubItem.id)
    if (data?.id) setSelectedEpisodeId(data.id)
  }

  const deleteSelectedEpisode = async () => {
    if (!selectedEpisode || !selectedSubItemId) {
      setError('削除する話を選択してください。')
      return
    }

    const { error: deleteError } = await supabase.from('subitem_episodes').delete().eq('id', selectedEpisode.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadEpisodes(selectedSubItemId)
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
      has_episodes: false,
      scheduled_on: null,
      tags: [],
      body: '',
      sort_order: baseSortOrder + index,
    }))

    const { error: insertError } = await supabase.from('threads').insert(payload)
    if (insertError) {
      if (insertError.message.includes('has_episodes')) {
        setError('threads テーブルに has_episodes 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(insertError.message)
      }
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

    if (selectedSubItem.has_episodes) {
      if (!selectedEpisode) {
        setError('本文を保存する話を選択してください。')
        return
      }

      const { error: updateError } = await supabase
        .from('subitem_episodes')
        .update({ body: subItemBodyDraft })
        .eq('id', selectedEpisode.id)

      if (updateError) {
        setError(updateError.message)
        return
      }

      if (selectedSubItemId) await loadEpisodes(selectedSubItemId)
      return
    }

    const { error: updateError } = await supabase.from('threads').update({ body: subItemBodyDraft }).eq('id', selectedSubItem.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    if (selectedItemId) await loadSubItems(selectedItemId)
  }

  const submitFilterTerm = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const trimmed = filterTermDraft.trim()
    if (!trimmed) {
      setError('除去語句を入力してください。')
      return
    }

    const { error: upsertError } = await supabase
      .from('parser_filter_terms')
      .upsert({ term: trimmed }, { onConflict: 'term' })

    if (upsertError) {
      if (isMissingRelationError(upsertError.message)) {
        setError('parser_filter_terms テーブルが必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(upsertError.message)
      }
      return
    }

    setFilterTermDraft('')
    await loadFilterTerms()
  }

  const deleteFilterTerm = async (termRow: FilterTermRow) => {
    const { error: deleteError } = await supabase.from('parser_filter_terms').delete().eq('id', termRow.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadFilterTerms()
  }

  const clearSpeakerProfileDraft = () => {
    setSpeakerNameDraft('')
    setSpeakerIconUrlDraft('')
    setSpeakerIconFile(null)
    setEditingSpeakerProfileId(null)
  }

  const startEditSpeakerProfile = (profile: SpeakerProfileRow) => {
    setEditingSpeakerProfileId(profile.id)
    setSpeakerNameDraft(profile.name)
    setSpeakerIconUrlDraft(profile.icon_url ?? '')
    setSpeakerIconFile(null)
  }

  const uploadSpeakerIcon = async (speakerName: string, file: File) => {
    const safeSpeaker = speakerName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'speaker'
    const safeFile = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${safeSpeaker}/${Date.now()}_${safeFile}`
    const { error: uploadError } = await supabase.storage.from('speaker-icons').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) {
      throw uploadError
    }
    const { data } = supabase.storage.from('speaker-icons').getPublicUrl(path)
    return data.publicUrl
  }

  const submitSpeakerProfile = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const name = speakerNameDraft.trim()
    if (!name) {
      setError('話者名を入力してください。')
      return
    }

    let iconUrl: string | null = speakerIconUrlDraft.trim() || null
    if (speakerIconFile) {
      try {
        iconUrl = await uploadSpeakerIcon(name, speakerIconFile)
      } catch (uploadError) {
        const message =
          uploadError instanceof Error ? uploadError.message : 'アイコンアップロードに失敗しました。'
        if (String(message).includes('Bucket not found')) {
          setError('Storage バケット `speaker-icons` がありません。Supabase Storageで作成してください。')
        } else {
          setError(String(message))
        }
        return
      }
    }

    const payload = {
      name,
      icon_url: iconUrl,
    }

    const { error: upsertError } = editingSpeakerProfileId
      ? await supabase.from('speaker_profiles').update(payload).eq('id', editingSpeakerProfileId)
      : await supabase.from('speaker_profiles').upsert(payload, { onConflict: 'name' })

    if (upsertError) {
      if (isMissingRelationError(upsertError.message)) {
        setError('speaker_profiles テーブルが必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(upsertError.message)
      }
      return
    }

    clearSpeakerProfileDraft()
    await loadSpeakerProfiles()
  }

  const deleteSpeakerProfile = async (profile: SpeakerProfileRow) => {
    const { error: deleteError } = await supabase.from('speaker_profiles').delete().eq('id', profile.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (editingSpeakerProfileId === profile.id) clearSpeakerProfileDraft()
    await loadSpeakerProfiles()
  }

  const runSpeakerSplit = () => {
    const parsed = parseScriptLines(
      subItemBodyDraft,
      filterTerms.map((term) => term.term),
      speakerProfiles.map((profile) => profile.name),
    )

    if (parsed.length === 0) {
      setParsedLines([])
      setError('解析できる本文がありませんでした。除去語句か本文を確認してください。')
      return
    }

    setError('')
    setParsedLines(parsed)
    const formatted = parsed
      .map((row) => (row.kind === 'direction' ? row.content : `${row.speaker}\n${row.content}`))
      .join('\n\n')
    setSubItemBodyDraft(formatted)
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
              onClick={() => setPageMode((current) => (current === 'settings' ? 'main' : 'settings'))}
            >
              {pageMode === 'settings' ? '戻る' : '設定'}
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
                  className={`list-item item-list-item ${selectedItemId === item.id ? 'active' : ''} ${
                    dragState?.kind === 'item' && dragState.id === item.id ? 'dragging' : ''
                  }`}
                  onClick={() => handleItemButton(item)}
                  draggable
                  onDragStart={(event) => startSortDrag('item', item.id, event)}
                  onDragOver={(event) => allowSortDrop('item', item.id, event)}
                  onDrop={(event) => void dropSort('item', item.id, event)}
                  onDragEnd={() => setDragState(null)}
                >
                  {item.title}
                </button>
              ))
            )}
          </div>

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
                      } ${dragState?.kind === 'template' && dragState.id === template.id ? 'dragging' : ''}`}
                      onClick={() => handleSettingsTemplateButton(template)}
                      draggable
                      onDragStart={(event) => startSortDrag('template', template.id, event)}
                      onDragOver={(event) => allowSortDrop('template', template.id, event)}
                      onDrop={(event) => void dropSort('template', template.id, event)}
                      onDragEnd={() => setDragState(null)}
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
                      } ${dragState?.kind === 'tag' && dragState.id === tag.id ? 'dragging' : ''}`}
                      onClick={() => handleSettingsTagButton(tag)}
                      draggable
                      onDragStart={(event) => startSortDrag('tag', tag.id, event)}
                      onDragOver={(event) => allowSortDrop('tag', tag.id, event)}
                      onDrop={(event) => void dropSort('tag', tag.id, event)}
                      onDragEnd={() => setDragState(null)}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="settings-section">
              <h3>除去語句設定</h3>
              <p className="subtle">本文解析時に、行がこの語句と完全一致した場合は除去します。</p>
              <form className="settings-inline-form" onSubmit={submitFilterTerm}>
                <input
                  value={filterTermDraft}
                  onChange={(event) => setFilterTermDraft(event.target.value)}
                  placeholder="例: 効果音"
                />
                <button type="submit">追加</button>
              </form>
              <div className="settings-token-list">
                {filterTerms.length === 0 ? (
                  <p className="subtle">除去語句はまだありません</p>
                ) : (
                  filterTerms.map((termRow) => (
                    <button
                      key={termRow.id}
                      type="button"
                      className="settings-token-chip"
                      onClick={() =>
                        openConfirmDialog({
                          title: '除去語句の削除',
                          message: `「${termRow.term}」を削除します。`,
                          confirmLabel: '削除する',
                          onConfirm: async () => {
                            await deleteFilterTerm(termRow)
                          },
                        })
                      }
                    >
                      {termRow.term} ×
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="settings-section">
              <h3>話者アイコン設定</h3>
              <p className="subtle">話者名で一致した場合にアイコン表示します。未設定は灰色アイコンになります。</p>
              <form className="stack-form" onSubmit={submitSpeakerProfile}>
                <div className="settings-inline-form">
                  <input
                    value={speakerNameDraft}
                    onChange={(event) => setSpeakerNameDraft(event.target.value)}
                    placeholder="話者名"
                  />
                  <button type="submit">{editingSpeakerProfileId ? '更新' : '追加'}</button>
                </div>
                <input
                  value={speakerIconUrlDraft}
                  onChange={(event) => setSpeakerIconUrlDraft(event.target.value)}
                  placeholder="アイコンURL（任意）"
                />
                <label className="stack-inline-file">
                  画像ファイルをアップロード（任意）
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setSpeakerIconFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="subtle">Storageバケット名は `speaker-icons` を使用します。</p>
                {editingSpeakerProfileId && (
                  <button type="button" className="ghost-button" onClick={clearSpeakerProfileDraft}>
                    編集をキャンセル
                  </button>
                )}
              </form>
              <div className="speaker-profile-list">
                {speakerProfiles.length === 0 ? (
                  <p className="subtle">話者プロフィールはまだありません</p>
                ) : (
                  speakerProfiles.map((profile) => (
                    <article key={profile.id} className="speaker-profile-row">
                      <button type="button" className="speaker-profile-main" onClick={() => startEditSpeakerProfile(profile)}>
                        <span className="speaker-avatar">
                          {profile.icon_url ? (
                            <img src={profile.icon_url} alt={`${profile.name} icon`} loading="lazy" />
                          ) : (
                            <FallbackSpeakerIcon />
                          )}
                        </span>
                        <span className="speaker-profile-text">
                          <span className="speaker-name">{profile.name}</span>
                          <span className="subtle">{profile.icon_url ? profile.icon_url : 'アイコン未設定'}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="danger-button mini-action"
                        onClick={() =>
                          openConfirmDialog({
                            title: '話者プロフィールの削除',
                            message: `「${profile.name}」を削除します。`,
                            confirmLabel: '削除する',
                            onConfirm: async () => {
                              await deleteSpeakerProfile(profile)
                            },
                          })
                        }
                      >
                        削除
                      </button>
                    </article>
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
            {pageMode === 'subitemBody' ? (
              <>
                <div className="content-head body-page-head">
                  <div>
                    <h2>本文</h2>
                    <p className="subtle">
                      {selectedItem && selectedSubItem
                        ? `項目: ${selectedItem.title} / 項目内項目: ${selectedSubItem.title}`
                        : '本文を表示する項目内項目を選択してください。'}
                    </p>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => setPageMode('main')}>
                    項目ページへ戻る
                  </button>
                </div>

                <section className="main-section body-page-section">
                  {selectedSubItem ? (
                    <>
                      <div className="mode-toggle-group">
                        <button
                          type="button"
                          className={`ghost-button mode-toggle-button ${!selectedSubItem.has_episodes ? 'active' : ''}`}
                          onClick={() => void saveSubItemHasEpisodes(false)}
                        >
                          話なし（本文1つ）
                        </button>
                        <button
                          type="button"
                          className={`ghost-button mode-toggle-button ${selectedSubItem.has_episodes ? 'active' : ''}`}
                          onClick={() => void saveSubItemHasEpisodes(true)}
                        >
                          話あり（複数）
                        </button>
                      </div>

                      {selectedSubItem.has_episodes ? (
                        <>
                          <div className="episode-create-row">
                            <input
                              value={episodeTitle}
                              onChange={(event) => setEpisodeTitle(event.target.value)}
                              placeholder="新しい話タイトル"
                            />
                            <button type="button" onClick={addEpisode}>
                              話を追加
                            </button>
                          </div>

                          <div className="episode-list">
                            {episodes.length === 0 ? (
                              <p className="subtle">話がまだありません。上で作成してください。</p>
                            ) : (
                              episodes.map((episode) => (
                                <button
                                  key={episode.id}
                                  type="button"
                                  className={`list-item episode-list-item ${selectedEpisodeId === episode.id ? 'active' : ''} ${
                                    dragState?.kind === 'episode' && dragState.id === episode.id ? 'dragging' : ''
                                  }`}
                                  onClick={() => setSelectedEpisodeId(episode.id)}
                                  draggable
                                  onDragStart={(event) => startSortDrag('episode', episode.id, event)}
                                  onDragOver={(event) => allowSortDrop('episode', episode.id, event)}
                                  onDrop={(event) => void dropSort('episode', episode.id, event)}
                                  onDragEnd={() => setDragState(null)}
                                >
                                  {episode.title}
                                </button>
                              ))
                            )}
                          </div>

                          <div className="episode-actions">
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() =>
                                openConfirmDialog({
                                  title: '話の削除',
                                  message: selectedEpisode
                                    ? `「${selectedEpisode.title}」を削除します。`
                                    : '選択中の話を削除します。',
                                  confirmLabel: '削除する',
                                  onConfirm: async () => {
                                    await deleteSelectedEpisode()
                                  },
                                })
                              }
                              disabled={!selectedEpisode}
                            >
                              選択した話を削除
                            </button>
                          </div>
                        </>
                      ) : null}

                      <textarea
                        className="body-editor"
                        value={subItemBodyDraft}
                        onChange={(event) => setSubItemBodyDraft(event.target.value)}
                        placeholder={selectedSubItem.has_episodes ? '選択した話の本文を入力' : 'ここに本文を入力'}
                        disabled={selectedSubItem.has_episodes && !selectedEpisode}
                      />
                      <div className="body-editor-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={runSpeakerSplit}
                          disabled={selectedSubItem.has_episodes && !selectedEpisode}
                        >
                          話者で振り分け
                        </button>
                        <button
                          type="button"
                          onClick={saveSelectedSubItemBody}
                          disabled={selectedSubItem.has_episodes && !selectedEpisode}
                        >
                          本文を保存
                        </button>
                      </div>

                      {parsedLines.length > 0 && (
                        <div className="parsed-line-list">
                          {parsedLines.map((row, index) => {
                            const profile = speakerProfiles.find((speaker) => speaker.name === row.speaker) ?? null
                            if (row.kind === 'direction') {
                              return (
                                <article key={`direction-${index}`} className="parsed-line-row parsed-line-row-direction">
                                  <p className="parsed-direction-label">演出</p>
                                  <p className="parsed-line-text">{row.content}</p>
                                </article>
                              )
                            }
                            return (
                              <article key={`${row.speaker}-${index}`} className="parsed-line-row">
                                <span className="speaker-avatar">
                                  {profile?.icon_url ? (
                                    <img src={profile.icon_url} alt={`${row.speaker} icon`} loading="lazy" />
                                  ) : (
                                    <FallbackSpeakerIcon />
                                  )}
                                </span>
                                <div className="parsed-line-content">
                                  <p className="speaker-name">{row.speaker}</p>
                                  <p className="parsed-line-text">{row.content}</p>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="subtle">項目ページで項目内項目を選択してから本文ページを開いてください。</p>
                  )}
                </section>
              </>
            ) : (
              <>
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
                        subItems.map((subItem) => (
                          <article
                            key={subItem.id}
                            className={`subitem-card ${selectedSubItemId === subItem.id ? 'active' : ''} ${
                              dragState?.kind === 'subitem' && dragState.id === subItem.id ? 'dragging' : ''
                            }`}
                            draggable
                            onDragStart={(event) => startSortDrag('subitem', subItem.id, event)}
                            onDragOver={(event) => allowSortDrop('subitem', subItem.id, event)}
                            onDrop={(event) => void dropSort('subitem', subItem.id, event)}
                            onDragEnd={() => setDragState(null)}
                          >
                            <header className="subitem-header">
                              <button
                                type="button"
                                className="subitem-select"
                                onClick={() => openSubItemBodyPage(subItem)}
                              >
                                {subItem.title}
                              </button>
                              <div className="subitem-actions">
                                <span className="subitem-mode-badge">{subItem.has_episodes ? '話あり' : '話なし'}</span>
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
                          } ${dragState?.kind === 'tag' && dragState.id === tag.id ? 'dragging' : ''}`}
                          onClick={() => void handleMainTagButton(tag)}
                          disabled={!selectedItemId}
                          draggable
                          onDragStart={(event) => startSortDrag('tag', tag.id, event)}
                          onDragOver={(event) => allowSortDrop('tag', tag.id, event)}
                          onDrop={(event) => void dropSort('tag', tag.id, event)}
                          onDragEnd={() => setDragState(null)}
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
                          } ${dragState?.kind === 'template' && dragState.id === template.id ? 'dragging' : ''}`}
                          onClick={() => void handleMainTemplateButton(template)}
                          disabled={!selectedItemId}
                          draggable
                          onDragStart={(event) => startSortDrag('template', template.id, event)}
                          onDragOver={(event) => allowSortDrop('template', template.id, event)}
                          onDrop={(event) => void dropSort('template', template.id, event)}
                          onDragEnd={() => setDragState(null)}
                        >
                          {template.title}
                        </button>
                      ))
                    )}
                  </div>
                  {mainSelectedTemplateIds.length > 0 && (
                    <div className="selected-template-list">
                      {mainSelectedTemplateIds.map((templateId) => {
                        const templateName =
                          subItemTemplates.find((template) => template.id === templateId)?.title ?? templateId
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
              </>
            )}
          </section>
        )}
      </section>

      {presetDialog && (
        <div className="overlay">
          <form className="dialog-panel" onSubmit={onSubmitPresetDialogForm}>
            <h2>
              {presetDialog.kind === 'item'
                ? '項目の詳細設定'
                : presetDialog.kind === 'template'
                ? presetDialog.mode === 'create'
                  ? '項目内項目を作成'
                  : '項目内項目の詳細設定'
                : presetDialog.mode === 'create'
                  ? 'タグを作成'
                  : 'タグの詳細設定'}
            </h2>
            <label className="dialog-field">
              {presetDialog.kind === 'item' ? '項目名' : '名称'}
              <input
                value={presetNameDraft}
                onChange={(event) => setPresetNameDraft(event.target.value)}
                placeholder={presetDialog.kind === 'item' ? '項目名を入力' : '名称を入力'}
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
              <button type="submit" disabled={dialogBusy}>
                {presetDialog.mode === 'create' ? '作成' : '保存'}
              </button>
            </div>
          </form>
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

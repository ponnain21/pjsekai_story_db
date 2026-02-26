import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type ItemRow = {
  id: string
  title: string
  scheduled_on: string | null
  scheduled_from: string | null
  scheduled_to: string | null
  tags: string[] | null
  sort_order: number
  created_at: string
}

type SubItemRow = {
  id: string
  node_id: string
  title: string
  has_episodes: boolean
  episode_number_start: number
  episode_labels: string[]
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
  label: string | null
  tags: string[] | null
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

type EpisodeTagPresetRow = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

type BodyTagPresetRow = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

type BodyTagAnnotationRow = {
  id: string
  tag_id: string
  thread_id: string | null
  episode_id: string | null
  start_offset: number
  end_offset: number
  selected_text: string
  created_at: string
}

type FilterTermRow = {
  id: string
  term: string
  created_at: string
}

type LineClassification = 'speaker' | 'direction' | 'location'
type NonDialogueClassification = Exclude<LineClassification, 'speaker'>
type ParsedLineKind = 'dialogue' | NonDialogueClassification

type ParserLineRuleRow = {
  id: string
  line_text: string
  classification: LineClassification
  created_at: string
}

type SpeakerProfileRow = {
  id: string
  name: string
  icon_url: string | null
  speech_balloon_id: string | null
  created_at: string
}

type ParserHistoryAction =
  | {
      kind: 'set_filter_term'
      term: string
      beforeEnabled: boolean
      afterEnabled: boolean
      reparse: boolean
    }
  | {
      kind: 'set_line_rule'
      lineText: string
      beforeClassification: LineClassification | null
      afterClassification: LineClassification | null
      reparse: boolean
    }
  | {
      kind: 'replace_body_draft'
      beforeBody: string
      afterBody: string
    }

type ParsedLineRow = {
  kind: ParsedLineKind
  speaker: string
  content: string
  sourceLine: string
  sourceRule: LineClassification | null
}

type SortableKind = 'item' | 'subitem' | 'episode' | 'template' | 'tag' | 'episodeTag' | 'bodyTag'

type PresetDialogState = {
  kind: 'item' | 'template' | 'tag' | 'episodeTag' | 'bodyTag'
  mode: 'create' | 'edit'
  id: string | null
}

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}

type EpisodeSettingsDialogState = {
  episodeId: string
  labelDraft: string
  selectedTags: string[]
}

type ItemSettingsDialogState = {
  selectedTags: string[]
  selectedTemplateIds: string[]
}

type BodyTagSelection = {
  start: number
  end: number
  selectedText: string
}

type BodyTagRangeGroup = {
  key: string
  start: number
  end: number
  text: string
  annotations: BodyTagAnnotationRow[]
}

type BodyTagPreviewSegment =
  | {
      kind: 'plain'
      key: string
      text: string
    }
  | {
      kind: 'tagged'
      key: string
      text: string
      group: BodyTagRangeGroup
    }

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))

const isMissingRelationError = (message: string) =>
  message.includes('relation') && message.includes('does not exist')

const getLineRule = (
  lineRuleMap: Map<string, LineClassification>,
  line: string,
): LineClassification | null => lineRuleMap.get(line) ?? null

const isNonDialogueClassification = (classification: LineClassification | null): classification is NonDialogueClassification =>
  classification === 'direction' || classification === 'location'

const toRuleLabel = (classification: LineClassification) =>
  classification === 'speaker' ? '話者' : classification === 'direction' ? '演出' : '場所'

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

const splitSpeakerAndDialogueFromSingleLine = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return null

  const colonMatch = trimmed.match(/^(.+?)[：:]\s*(.+)$/)
  if (colonMatch) {
    const speaker = colonMatch[1]?.trim()
    const dialogue = colonMatch[2]?.trim()
    if (speaker && dialogue) return { speaker, dialogue }
  }

  const quoteMatch = trimmed.match(/^(.+?)[「『](.+)[」』]$/)
  if (quoteMatch) {
    const speaker = quoteMatch[1]?.trim()
    const dialogue = quoteMatch[2]?.trim()
    if (speaker && dialogue) return { speaker, dialogue }
  }

  const openQuoteMatch = trimmed.match(/^(.+?)[「『](.+)$/)
  if (openQuoteMatch) {
    const speaker = openQuoteMatch[1]?.trim()
    const dialogue = openQuoteMatch[2]?.trim()
    if (speaker && dialogue) return { speaker, dialogue }
  }

  return null
}

const formatParsedRowsToBody = (rows: ParsedLineRow[]) =>
  rows.map((row) => (row.kind === 'dialogue' ? `${row.speaker}\n${row.content}` : row.content)).join('\n\n')

const getEpisodeDisplayLabel = (
  episode: EpisodeRow,
  index: number,
  episodeNumberStart: number,
  legacyLabels: string[],
) => {
  const directLabel = (episode.label ?? '').trim()
  if (directLabel) return directLabel
  const legacyLabel = (legacyLabels[index] ?? '').trim()
  if (legacyLabel) return legacyLabel
  return `${episodeNumberStart + index}.`
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

const parseScriptLines = (
  rawText: string,
  blockedTerms: string[],
  lineRuleMap: Map<string, LineClassification>,
  speakerNames: string[],
) => {
  const blockedSet = new Set(blockedTerms.map((term) => term.trim()).filter(Boolean))
  const knownSpeakers = new Set(speakerNames.map((name) => name.trim()).filter(Boolean))
  const lines = splitAndFilterLines(rawText, blockedSet)
  const rows: ParsedLineRow[] = []
  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    const lineRule = getLineRule(lineRuleMap, line)
    const nextRule = nextLine ? getLineRule(lineRuleMap, nextLine) : null
    const lineIsKnownSpeaker = knownSpeakers.has(line)
    const nextIsKnownSpeaker = nextLine ? knownSpeakers.has(nextLine) : false
    const lineIsForcedSpeaker = lineRule === 'speaker'
    const nextIsForcedSpeaker = nextRule === 'speaker'

    if (isNonDialogueClassification(lineRule)) {
      rows.push({
        kind: lineRule,
        speaker: '',
        content: line,
        sourceLine: line,
        sourceRule: lineRule,
      })
      index += 1
      continue
    }

    if ((lineIsKnownSpeaker || lineIsForcedSpeaker) && nextLine && !isNonDialogueClassification(nextRule)) {
      rows.push({
        kind: 'dialogue',
        speaker: line,
        content: nextLine,
        sourceLine: line,
        sourceRule: lineRule,
      })
      index += 2
      continue
    }

    if (nextLine && (nextIsKnownSpeaker || nextIsForcedSpeaker)) {
      rows.push({
        kind: 'direction',
        speaker: '',
        content: line,
        sourceLine: line,
        sourceRule: lineRule,
      })
      index += 1
      continue
    }

    if (nextLine && !isNonDialogueClassification(nextRule)) {
      rows.push({
        kind: 'dialogue',
        speaker: line,
        content: nextLine,
        sourceLine: line,
        sourceRule: lineRule,
      })
      index += 2
      continue
    }

    rows.push({
      kind: 'direction',
      speaker: '',
      content: line,
      sourceLine: line,
      sourceRule: lineRule,
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
  const [episodeTagPresets, setEpisodeTagPresets] = useState<EpisodeTagPresetRow[]>([])
  const [bodyTagPresets, setBodyTagPresets] = useState<BodyTagPresetRow[]>([])
  const [bodyTagAnnotations, setBodyTagAnnotations] = useState<BodyTagAnnotationRow[]>([])
  const [filterTerms, setFilterTerms] = useState<FilterTermRow[]>([])
  const [lineRules, setLineRules] = useState<ParserLineRuleRow[]>([])
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfileRow[]>([])

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedSettingsTemplateId, setSelectedSettingsTemplateId] = useState<string | null>(null)
  const [selectedSettingsTagId, setSelectedSettingsTagId] = useState<string | null>(null)
  const [selectedSettingsEpisodeTagId, setSelectedSettingsEpisodeTagId] = useState<string | null>(null)
  const [selectedSettingsBodyTagId, setSelectedSettingsBodyTagId] = useState<string | null>(null)
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)

  const [itemTitle, setItemTitle] = useState('')

  const [mainScheduledFrom, setMainScheduledFrom] = useState('')
  const [mainScheduledTo, setMainScheduledTo] = useState('')
  const [mainSelectedTags, setMainSelectedTags] = useState<string[]>([])
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [subItemBodyDraft, setSubItemBodyDraft] = useState('')
  const [filterTermDraft, setFilterTermDraft] = useState('')
  const [speakerNameDraft, setSpeakerNameDraft] = useState('')
  const [speakerIconUrlDraft, setSpeakerIconUrlDraft] = useState('')
  const [speakerBalloonIdDraft, setSpeakerBalloonIdDraft] = useState('')
  const [speakerIconFile, setSpeakerIconFile] = useState<File | null>(null)
  const [editingSpeakerProfileId, setEditingSpeakerProfileId] = useState<string | null>(null)
  const [parsedLines, setParsedLines] = useState<ParsedLineRow[]>([])
  const [balloonExportText, setBalloonExportText] = useState('')
  const [parserUndoStack, setParserUndoStack] = useState<ParserHistoryAction[]>([])
  const [parserRedoStack, setParserRedoStack] = useState<ParserHistoryAction[]>([])
  const [presetDialog, setPresetDialog] = useState<PresetDialogState | null>(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [episodeSettingsDialog, setEpisodeSettingsDialog] = useState<EpisodeSettingsDialogState | null>(null)
  const [itemSettingsDialog, setItemSettingsDialog] = useState<ItemSettingsDialogState | null>(null)
  const [speakerSettingsDialogOpen, setSpeakerSettingsDialogOpen] = useState(false)
  const [bodyTagSelection, setBodyTagSelection] = useState<BodyTagSelection | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dragState, setDragState] = useState<{ kind: SortableKind; id: string } | null>(null)

  const lineRuleMap = useMemo(
    () => new Map(lineRules.map((rule) => [rule.line_text, rule.classification])),
    [lineRules],
  )
  const lineRuleEntryMap = useMemo(
    () => new Map(lineRules.map((rule) => [rule.line_text, rule])),
    [lineRules],
  )
  const bodyTagPresetMap = useMemo(
    () => new Map(bodyTagPresets.map((tag) => [tag.id, tag.name])),
    [bodyTagPresets],
  )

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedSubItem = subItems.find((subItem) => subItem.id === selectedSubItemId) ?? null
  const selectedEpisode = episodes.find((episode) => episode.id === selectedEpisodeId) ?? null
  const bodyTagTarget = useMemo(() => {
    if (!selectedSubItem) return null
    if (!selectedSubItem.has_episodes) return { threadId: selectedSubItem.id as string | null, episodeId: null as string | null }
    if (!selectedEpisode) return null
    return { threadId: null as string | null, episodeId: selectedEpisode.id as string | null }
  }, [selectedSubItem?.id, selectedSubItem?.has_episodes, selectedEpisode?.id])
  const bodyTagGroups = useMemo<BodyTagRangeGroup[]>(() => {
    if (!subItemBodyDraft || bodyTagAnnotations.length === 0) return []
    const normalized = bodyTagAnnotations
      .filter((row) => row.start_offset >= 0 && row.end_offset > row.start_offset && row.end_offset <= subItemBodyDraft.length)
      .map((row) => ({ ...row }))
      .sort((a, b) => (a.start_offset - b.start_offset) || (a.end_offset - b.end_offset) || a.created_at.localeCompare(b.created_at))

    const groups: BodyTagRangeGroup[] = []
    for (const row of normalized) {
      const key = `${row.start_offset}-${row.end_offset}`
      const existing = groups.find((group) => group.key === key) ?? null
      if (existing) {
        existing.annotations.push(row)
        continue
      }

      const text = subItemBodyDraft.slice(row.start_offset, row.end_offset)
      groups.push({
        key,
        start: row.start_offset,
        end: row.end_offset,
        text,
        annotations: [row],
      })
    }
    return groups
  }, [bodyTagAnnotations, subItemBodyDraft])
  const bodyTagPreviewSegments = useMemo<BodyTagPreviewSegment[]>(() => {
    if (!subItemBodyDraft) return []
    if (bodyTagGroups.length === 0) {
      return [{ kind: 'plain', key: 'plain-all', text: subItemBodyDraft }]
    }

    const segments: BodyTagPreviewSegment[] = []
    let cursor = 0
    for (const group of bodyTagGroups) {
      if (group.start < cursor) continue
      if (cursor < group.start) {
        segments.push({
          kind: 'plain',
          key: `plain-${cursor}-${group.start}`,
          text: subItemBodyDraft.slice(cursor, group.start),
        })
      }
      segments.push({
        kind: 'tagged',
        key: `tag-${group.key}`,
        text: subItemBodyDraft.slice(group.start, group.end),
        group,
      })
      cursor = group.end
    }
    if (cursor < subItemBodyDraft.length) {
      segments.push({
        kind: 'plain',
        key: `plain-${cursor}-${subItemBodyDraft.length}`,
        text: subItemBodyDraft.slice(cursor),
      })
    }
    return segments
  }, [bodyTagGroups, subItemBodyDraft])

  useEffect(() => {
    const fallbackDate = selectedItem?.scheduled_on ?? ''
    setMainScheduledFrom(selectedItem?.scheduled_from ?? fallbackDate)
    setMainScheduledTo(selectedItem?.scheduled_to ?? '')
    setMainSelectedTags(uniqueStrings(selectedItem?.tags ?? []))
  }, [
    selectedItem?.id,
    selectedItem?.scheduled_on,
    selectedItem?.scheduled_from,
    selectedItem?.scheduled_to,
    selectedItem?.tags,
  ])

  useEffect(() => {
    if (selectedSubItem?.has_episodes) {
      setSubItemBodyDraft(selectedEpisode?.body ?? '')
      setBodyTagSelection(null)
      setParsedLines([])
      setBalloonExportText('')
      setParserUndoStack([])
      setParserRedoStack([])
      return
    }
    setSubItemBodyDraft(selectedSubItem?.body ?? '')
    setBodyTagSelection(null)
    setParsedLines([])
    setBalloonExportText('')
    setParserUndoStack([])
    setParserRedoStack([])
  }, [selectedSubItem?.id, selectedSubItem?.has_episodes, selectedSubItem?.body, selectedEpisode?.id, selectedEpisode?.body])

  useEffect(() => {
    if (pageMode === 'subitemBody' && !selectedSubItemId) {
      setPageMode('main')
    }
  }, [pageMode, selectedSubItemId])

  useEffect(() => {
    setItemSettingsDialog(null)
  }, [selectedItemId])

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
      .select('id, title, scheduled_on, scheduled_from, scheduled_to, tags, sort_order, created_at')
      .is('parent_id', null)
      .order('scheduled_from', { ascending: true, nullsFirst: false })
      .order('scheduled_on', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      if (loadError.message.includes('scheduled_from') || loadError.message.includes('scheduled_to')) {
        const { data: partialData, error: partialError } = await supabase
          .from('nodes')
          .select('id, title, scheduled_on, tags, sort_order, created_at')
          .is('parent_id', null)
          .order('scheduled_on', { ascending: true, nullsFirst: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (partialError) {
          setError(partialError.message)
          return
        }

        const fallbackItems = (
          (partialData ?? []) as Omit<ItemRow, 'scheduled_from' | 'scheduled_to'>[]
        ).map((item) => ({
          ...item,
          scheduled_from: item.scheduled_on,
          scheduled_to: null,
        }))
        applyLoadedItems(fallbackItems)
        return
      }

      const { data: legacyData, error: legacyError } = await supabase
        .from('nodes')
        .select('id, title, created_at')
        .is('parent_id', null)
        .order('created_at', { ascending: true })

      if (legacyError) {
        setError(loadError.message)
        return
      }

      const fallbackItems = ((legacyData ?? []) as Omit<ItemRow, 'scheduled_on' | 'scheduled_from' | 'scheduled_to' | 'tags' | 'sort_order'>[]).map(
        (item) => ({
        ...item,
        scheduled_on: null,
        scheduled_from: null,
        scheduled_to: null,
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
      .select('id, node_id, title, has_episodes, episode_number_start, episode_labels, scheduled_on, tags, body, sort_order, created_at')
      .eq('node_id', itemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      if (loadError.message.includes('episode_labels')) {
        const { data: partialData, error: partialError } = await supabase
          .from('threads')
          .select('id, node_id, title, has_episodes, episode_number_start, scheduled_on, tags, body, sort_order, created_at')
          .eq('node_id', itemId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (partialError) {
          setError(partialError.message)
          return
        }

        const fallbackSubItems = (
          (partialData ?? []) as Omit<SubItemRow, 'episode_labels'>[]
        ).map((subItem) => ({ ...subItem, episode_labels: [] }))
        setSubItems(fallbackSubItems)
        setSelectedSubItemId((current) => {
          if (current && fallbackSubItems.some((subItem) => subItem.id === current)) return current
          return fallbackSubItems[0]?.id ?? null
        })
        return
      }

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

      const fallbackSubItems = ((legacyData ?? []) as Omit<SubItemRow, 'has_episodes' | 'episode_number_start' | 'episode_labels'>[]).map((subItem) => ({
        ...subItem,
        has_episodes: false,
        episode_number_start: 1,
        episode_labels: [],
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
      .select('id, thread_id, title, label, tags, body, sort_order, created_at')
      .eq('thread_id', subItemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      if (loadError.message.includes('label') || loadError.message.includes('tags')) {
        const { data: partialData, error: partialError } = await supabase
          .from('subitem_episodes')
          .select('id, thread_id, title, body, sort_order, created_at')
          .eq('thread_id', subItemId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (partialError) {
          setError(partialError.message)
          return
        }

        const fallbackEpisodes = (
          (partialData ?? []) as Omit<EpisodeRow, 'label' | 'tags'>[]
        ).map((episode) => ({
          ...episode,
          label: null,
          tags: [],
        }))
        setEpisodes(fallbackEpisodes)
        setSelectedEpisodeId((current) => {
          if (current && fallbackEpisodes.some((episode) => episode.id === current)) return current
          return fallbackEpisodes[0]?.id ?? null
        })
        return
      }

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

  const loadEpisodeTagPresets = async () => {
    const applyLoadedTags = (loadedTags: EpisodeTagPresetRow[]) => {
      setEpisodeTagPresets(loadedTags)
      setSelectedSettingsEpisodeTagId((current) => {
        if (current && loadedTags.some((tag) => tag.id === current)) return current
        return null
      })
    }

    const { data, error: loadError } = await supabase
      .from('episode_tag_presets')
      .select('id, name, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setEpisodeTagPresets([])
        return
      }
      setError(loadError.message)
      return
    }

    applyLoadedTags((data ?? []) as EpisodeTagPresetRow[])
  }

  const loadBodyTagPresets = async () => {
    const applyLoadedTags = (loadedTags: BodyTagPresetRow[]) => {
      setBodyTagPresets(loadedTags)
      setSelectedSettingsBodyTagId((current) => {
        if (current && loadedTags.some((tag) => tag.id === current)) return current
        return null
      })
    }

    const { data, error: loadError } = await supabase
      .from('body_tag_presets')
      .select('id, name, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setBodyTagPresets([])
        return
      }
      setError(loadError.message)
      return
    }

    applyLoadedTags((data ?? []) as BodyTagPresetRow[])
  }

  const loadBodyTagAnnotations = async (target: { threadId: string | null; episodeId: string | null }) => {
    const baseQuery = supabase
      .from('body_tag_annotations')
      .select('id, tag_id, thread_id, episode_id, start_offset, end_offset, selected_text, created_at')
      .order('start_offset', { ascending: true })
      .order('end_offset', { ascending: true })
      .order('created_at', { ascending: true })

    const query =
      target.episodeId
        ? baseQuery.eq('episode_id', target.episodeId).is('thread_id', null)
        : baseQuery.eq('thread_id', target.threadId).is('episode_id', null)

    const { data, error: loadError } = await query
    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setBodyTagAnnotations([])
        return
      }
      setError(loadError.message)
      return
    }

    setBodyTagAnnotations((data ?? []) as BodyTagAnnotationRow[])
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

  const loadLineRules = async () => {
    const { data, error: loadError } = await supabase
      .from('parser_line_classifications')
      .select('id, line_text, classification, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      if (isMissingRelationError(loadError.message)) {
        setLineRules([])
        return
      }
      setError(loadError.message)
      return
    }

    setLineRules((data ?? []) as ParserLineRuleRow[])
  }

  const loadSpeakerProfiles = async () => {
    const { data, error: loadError } = await supabase
      .from('speaker_profiles')
      .select('id, name, icon_url, speech_balloon_id, created_at')
      .order('created_at', { ascending: true })

    if (loadError) {
      if (loadError.message.includes('speech_balloon_id')) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('speaker_profiles')
          .select('id, name, icon_url, created_at')
          .order('created_at', { ascending: true })

        if (legacyError) {
          setError(legacyError.message)
          return
        }

        const fallbackProfiles = (
          (legacyData ?? []) as Omit<SpeakerProfileRow, 'speech_balloon_id'>[]
        ).map((profile) => ({ ...profile, speech_balloon_id: null }))
        setSpeakerProfiles(fallbackProfiles)
        return
      }
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
      setEpisodeTagPresets([])
      setBodyTagPresets([])
      setBodyTagAnnotations([])
      setFilterTerms([])
      setLineRules([])
      setSpeakerProfiles([])
      setSelectedItemId(null)
      setSelectedSettingsTemplateId(null)
      setSelectedSettingsTagId(null)
      setSelectedSettingsEpisodeTagId(null)
      setSelectedSettingsBodyTagId(null)
      setSelectedSubItemId(null)
      setSelectedEpisodeId(null)
      setEditingSpeakerProfileId(null)
      setParsedLines([])
      setBalloonExportText('')
      setParserUndoStack([])
      setParserRedoStack([])
      setBodyTagSelection(null)
      return
    }
    void loadItems()
    void loadSubItemTemplates()
    void loadTagPresets()
    void loadEpisodeTagPresets()
    void loadBodyTagPresets()
    void loadFilterTerms()
    void loadLineRules()
    void loadSpeakerProfiles()
  }, [session, accessStatus])

  useEffect(() => {
    if (!selectedItemId) {
      setSubItems([])
      setEpisodes([])
      setSelectedSubItemId(null)
      setSelectedEpisodeId(null)
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

  useEffect(() => {
    if (pageMode !== 'subitemBody' || !bodyTagTarget) {
      setBodyTagAnnotations([])
      return
    }
    void loadBodyTagAnnotations(bodyTagTarget)
  }, [pageMode, bodyTagTarget?.threadId, bodyTagTarget?.episodeId])

  useEffect(() => {
    if (pageMode !== 'subitemBody' || !selectedSubItem) {
      setParsedLines([])
      return
    }

    if (selectedSubItem.has_episodes && !selectedEpisode) {
      setParsedLines([])
      return
    }

    if (!subItemBodyDraft.trim()) {
      setParsedLines([])
      return
    }

    const timerId = window.setTimeout(() => {
      const parsed = parseScriptLines(
        subItemBodyDraft,
        filterTerms.map((term) => term.term),
        lineRuleMap,
        speakerProfiles.map((profile) => profile.name),
      )
      setParsedLines(parsed)
    }, 250)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    pageMode,
    selectedSubItem?.id,
    selectedSubItem?.has_episodes,
    selectedEpisode?.id,
    subItemBodyDraft,
    filterTerms,
    lineRuleMap,
    speakerProfiles,
  ])

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

  const saveItemMeta = async (scheduledFrom: string, scheduledTo: string, tags: string[]) => {
    if (!selectedItemId) return
    const from = scheduledFrom.trim()
    const to = scheduledTo.trim()
    if (from && to && from > to) {
      setError('日付範囲が不正です。終了日は開始日以降にしてください。')
      return
    }

    const { error: updateError } = await supabase
      .from('nodes')
      .update({
        scheduled_from: from || null,
        scheduled_to: to || null,
        scheduled_on: from || null,
        tags: uniqueStrings(tags),
      })
      .eq('id', selectedItemId)

    if (updateError) {
      if (
        updateError.message.includes('scheduled_on') ||
        updateError.message.includes('scheduled_from') ||
        updateError.message.includes('scheduled_to') ||
        updateError.message.includes('tags')
      ) {
        setError('nodes テーブルに scheduled_on / scheduled_from / scheduled_to / tags 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(updateError.message)
      }
      return
    }

    setError('')
    await loadItems()
  }

  const handleMainDateFromChange = async (value: string) => {
    setMainScheduledFrom(value)
    await saveItemMeta(value, mainScheduledTo, mainSelectedTags)
  }

  const handleMainDateToChange = async (value: string) => {
    setMainScheduledTo(value)
    await saveItemMeta(mainScheduledFrom, value, mainSelectedTags)
  }

  const persistSortOrder = async (
    table:
      | 'nodes'
      | 'threads'
      | 'subitem_episodes'
      | 'subitem_templates'
      | 'subitem_tag_presets'
      | 'episode_tag_presets'
      | 'body_tag_presets',
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

  const reorderEpisodeTags = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(episodeTagPresets, draggedId, targetId)
    setEpisodeTagPresets(reordered)
    const ok = await persistSortOrder(
      'episode_tag_presets',
      reordered.map((row) => row.id),
    )
    if (!ok) await loadEpisodeTagPresets()
  }

  const reorderBodyTags = async (draggedId: string, targetId: string) => {
    const reordered = reorderRowsByIds(bodyTagPresets, draggedId, targetId)
    setBodyTagPresets(reordered)
    const ok = await persistSortOrder(
      'body_tag_presets',
      reordered.map((row) => row.id),
    )
    if (!ok) await loadBodyTagPresets()
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
    if (kind === 'episodeTag') await reorderEpisodeTags(dragState.id, targetId)
    if (kind === 'bodyTag') await reorderBodyTags(dragState.id, targetId)

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

  const openCreatePresetDialog = (kind: 'template' | 'tag' | 'episodeTag' | 'bodyTag') => {
    setPresetNameDraft('')
    setPresetDialog({ kind, mode: 'create', id: null })
  }

  const openEditPresetDialog = (kind: 'item' | 'template' | 'tag' | 'episodeTag' | 'bodyTag', id: string) => {
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

    if (kind === 'tag') {
      const tag = tagPresets.find((current) => current.id === id)
      if (!tag) return
      setSelectedSettingsTagId(tag.id)
      setPresetNameDraft(tag.name)
      setPresetDialog({ kind: 'tag', mode: 'edit', id: tag.id })
      return
    }

    if (kind === 'episodeTag') {
      const tag = episodeTagPresets.find((current) => current.id === id)
      if (!tag) return
      setSelectedSettingsEpisodeTagId(tag.id)
      setPresetNameDraft(tag.name)
      setPresetDialog({ kind: 'episodeTag', mode: 'edit', id: tag.id })
      return
    }

    const tag = bodyTagPresets.find((current) => current.id === id)
    if (!tag) return
    setSelectedSettingsBodyTagId(tag.id)
    setPresetNameDraft(tag.name)
    setPresetDialog({ kind: 'bodyTag', mode: 'edit', id: tag.id })
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
      } else if (presetDialog.kind === 'tag') {
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
      } else if (presetDialog.kind === 'episodeTag') {
        if (presetDialog.mode === 'create') {
          const nextSortOrder =
            episodeTagPresets.length === 0 ? 0 : Math.max(...episodeTagPresets.map((tag) => tag.sort_order)) + 1
          const { data, error: insertError } = await supabase
            .from('episode_tag_presets')
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
          await loadEpisodeTagPresets()
          if (data?.id) setSelectedSettingsEpisodeTagId(data.id)
        } else {
          if (!presetDialog.id) {
            setError('更新する各話タグが見つかりません。')
            return
          }
          const { error: updateError } = await supabase
            .from('episode_tag_presets')
            .update({ name: trimmed })
            .eq('id', presetDialog.id)
          if (updateError) {
            setError(updateError.message)
            return
          }
          await loadEpisodeTagPresets()
        }
      } else {
        if (presetDialog.mode === 'create') {
          const nextSortOrder =
            bodyTagPresets.length === 0 ? 0 : Math.max(...bodyTagPresets.map((tag) => tag.sort_order)) + 1
          const { data, error: insertError } = await supabase
            .from('body_tag_presets')
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
          await loadBodyTagPresets()
          if (data?.id) setSelectedSettingsBodyTagId(data.id)
        } else {
          if (!presetDialog.id) {
            setError('更新する本文タグが見つかりません。')
            return
          }
          const { error: updateError } = await supabase
            .from('body_tag_presets')
            .update({ name: trimmed })
            .eq('id', presetDialog.id)
          if (updateError) {
            setError(updateError.message)
            return
          }
          await loadBodyTagPresets()
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

    if (presetDialog.kind === 'tag') {
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
          await saveItemMeta(mainScheduledFrom, mainScheduledTo, nextTags)
          setPresetDialog(null)
        },
      })
      return
    }

    if (presetDialog.kind === 'episodeTag') {
      const tag = episodeTagPresets.find((current) => current.id === presetDialog.id)
      if (!tag) return
      openConfirmDialog({
        title: '各話タグの削除',
        message: `「${tag.name}」を削除します。`,
        confirmLabel: '削除する',
        onConfirm: async () => {
          const { error: deleteError } = await supabase.from('episode_tag_presets').delete().eq('id', tag.id)
          if (deleteError) {
            setError(deleteError.message)
            return
          }
          await loadEpisodeTagPresets()
          setEpisodeSettingsDialog((current) =>
            current ? { ...current, selectedTags: current.selectedTags.filter((name) => name !== tag.name) } : current,
          )
          setPresetDialog(null)
        },
      })
      return
    }

    const bodyTag = bodyTagPresets.find((current) => current.id === presetDialog.id)
    if (!bodyTag) return
    openConfirmDialog({
      title: '本文タグの削除',
      message: `「${bodyTag.name}」を削除します。`,
      confirmLabel: '削除する',
      onConfirm: async () => {
        const { error: deleteError } = await supabase.from('body_tag_presets').delete().eq('id', bodyTag.id)
        if (deleteError) {
          setError(deleteError.message)
          return
        }
        await loadBodyTagPresets()
        setBodyTagAnnotations((current) => current.filter((row) => row.tag_id !== bodyTag.id))
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

  const saveEpisodeNumberStart = async (start: 0 | 1) => {
    if (!selectedSubItem) return
    if (selectedSubItem.episode_number_start === start) return
    setError('')

    const { error: updateError } = await supabase
      .from('threads')
      .update({ episode_number_start: start })
      .eq('id', selectedSubItem.id)

    if (updateError) {
      if (updateError.message.includes('episode_number_start')) {
        setError('threads テーブルに episode_number_start 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(updateError.message)
      }
      return
    }

    if (selectedItemId) await loadSubItems(selectedItemId)
  }

  const openEpisodeSettings = (episode: EpisodeRow) => {
    setSelectedEpisodeId(episode.id)
    setEpisodeSettingsDialog({
      episodeId: episode.id,
      labelDraft: episode.label ?? '',
      selectedTags: uniqueStrings(episode.tags ?? []),
    })
  }

  const toggleEpisodeSettingsTag = (tagName: string) => {
    setEpisodeSettingsDialog((current) => {
      if (!current) return current
      if (current.selectedTags.includes(tagName)) {
        return { ...current, selectedTags: current.selectedTags.filter((name) => name !== tagName) }
      }
      return { ...current, selectedTags: uniqueStrings([...current.selectedTags, tagName]) }
    })
  }

  const saveEpisodeSettingsDialog = async () => {
    if (!episodeSettingsDialog || !selectedSubItemId || dialogBusy) return
    setError('')
    setDialogBusy(true)

    try {
      const label = episodeSettingsDialog.labelDraft.trim()
      const tags = uniqueStrings(episodeSettingsDialog.selectedTags)
      const { error: updateError } = await supabase
        .from('subitem_episodes')
        .update({
          label: label || null,
          tags,
        })
        .eq('id', episodeSettingsDialog.episodeId)

      if (updateError) {
        if (updateError.message.includes('label') || updateError.message.includes('tags')) {
          setError('subitem_episodes テーブルに label / tags 列が必要です。supabase/schema.sql を実行してください。')
        } else {
          setError(updateError.message)
        }
        return
      }

      await loadEpisodes(selectedSubItemId)
      setEpisodeSettingsDialog(null)
    } finally {
      setDialogBusy(false)
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
        label: null,
        tags: [],
        body: '',
        sort_order: nextSortOrder,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.message.includes('label') || insertError.message.includes('tags')) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('subitem_episodes')
          .insert({
            thread_id: selectedSubItem.id,
            title: trimmedTitle,
            body: '',
            sort_order: nextSortOrder,
          })
          .select('id')
          .single()

        if (legacyError) {
          setError(legacyError.message)
          return
        }

        setEpisodeTitle('')
        await loadEpisodes(selectedSubItem.id)
        if (legacyData?.id) setSelectedEpisodeId(legacyData.id)
        return
      }
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

  const addTemplatesToSelectedItem = async (templateIds: string[]) => {
    setError('')

    if (!selectedItemId) {
      setError('先に親項目を選択してください。')
      return false
    }
    if (templateIds.length === 0) {
      return true
    }

    const selectedTemplates = templateIds
      .map((templateId) => subItemTemplates.find((template) => template.id === templateId))
      .filter((template): template is SubItemTemplateRow => Boolean(template))

    if (selectedTemplates.length === 0) {
      setError('選択中の項目内項目が見つかりません。')
      return false
    }

    const baseSortOrder =
      subItems.length === 0 ? 0 : Math.max(...subItems.map((subItem) => subItem.sort_order)) + 1
    const payload = selectedTemplates.map((template, index) => ({
      node_id: selectedItemId,
      title: template.title,
      has_episodes: false,
      episode_number_start: 1,
      episode_labels: [],
      scheduled_on: null,
      tags: [],
      body: '',
      sort_order: baseSortOrder + index,
    }))

    const { error: insertError } = await supabase.from('threads').insert(payload)
    if (insertError) {
      if (
        insertError.message.includes('has_episodes') ||
        insertError.message.includes('episode_number_start') ||
        insertError.message.includes('episode_labels')
      ) {
        setError('threads テーブルに has_episodes / episode_number_start / episode_labels 列が必要です。supabase/schema.sql を実行してください。')
      } else {
        setError(insertError.message)
      }
      return false
    }

    await loadSubItems(selectedItemId)
    return true
  }

  const handleSettingsTagButton = (tag: TagPresetRow) => {
    if (selectedSettingsTagId === tag.id) {
      openEditPresetDialog('tag', tag.id)
      return
    }
    setSelectedSettingsTagId(tag.id)
  }

  const handleSettingsEpisodeTagButton = (tag: EpisodeTagPresetRow) => {
    if (selectedSettingsEpisodeTagId === tag.id) {
      openEditPresetDialog('episodeTag', tag.id)
      return
    }
    setSelectedSettingsEpisodeTagId(tag.id)
  }

  const handleSettingsBodyTagButton = (tag: BodyTagPresetRow) => {
    if (selectedSettingsBodyTagId === tag.id) {
      openEditPresetDialog('bodyTag', tag.id)
      return
    }
    setSelectedSettingsBodyTagId(tag.id)
  }

  const openItemSettingsDialog = () => {
    if (!selectedItemId) return
    setItemSettingsDialog({
      selectedTags: uniqueStrings(mainSelectedTags),
      selectedTemplateIds: [],
    })
  }

  const toggleItemSettingsTag = (tagName: string) => {
    setItemSettingsDialog((current) => {
      if (!current) return current
      if (current.selectedTags.includes(tagName)) {
        return { ...current, selectedTags: current.selectedTags.filter((name) => name !== tagName) }
      }
      return { ...current, selectedTags: uniqueStrings([...current.selectedTags, tagName]) }
    })
  }

  const toggleItemSettingsTemplate = (templateId: string) => {
    setItemSettingsDialog((current) => {
      if (!current) return current
      if (current.selectedTemplateIds.includes(templateId)) {
        return { ...current, selectedTemplateIds: current.selectedTemplateIds.filter((id) => id !== templateId) }
      }
      return { ...current, selectedTemplateIds: uniqueStrings([...current.selectedTemplateIds, templateId]) }
    })
  }

  const saveItemSettingsDialog = async () => {
    if (!itemSettingsDialog || !selectedItemId || dialogBusy) return
    setDialogBusy(true)
    try {
      await saveItemMeta(mainScheduledFrom, mainScheduledTo, itemSettingsDialog.selectedTags)
      const ok = await addTemplatesToSelectedItem(itemSettingsDialog.selectedTemplateIds)
      if (!ok) return
      setMainSelectedTags(itemSettingsDialog.selectedTags)
      setItemSettingsDialog(null)
    } finally {
      setDialogBusy(false)
    }
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

  const handleBodySelection = (start: number, end: number) => {
    if (end <= start) {
      setBodyTagSelection(null)
      return
    }
    const selectedText = subItemBodyDraft.slice(start, end)
    if (!selectedText.trim()) {
      setBodyTagSelection(null)
      return
    }
    setBodyTagSelection({ start, end, selectedText })
  }

  const addBodyTagToSelection = async (tagId: string) => {
    if (!bodyTagTarget || !bodyTagSelection) return
    setError('')

    const { start, end, selectedText } = bodyTagSelection
    const hasOverlapConflict = bodyTagAnnotations.some(
      (row) =>
        row.start_offset < end &&
        start < row.end_offset &&
        !(row.start_offset === start && row.end_offset === end),
    )
    if (hasOverlapConflict) {
      setError('重なる本文タグ範囲があります。同じ範囲で付与するか、既存タグを削除してください。')
      return
    }

    const duplicate = bodyTagAnnotations.some(
      (row) => row.tag_id === tagId && row.start_offset === start && row.end_offset === end,
    )
    if (duplicate) return

    const payload = {
      tag_id: tagId,
      thread_id: bodyTagTarget.threadId,
      episode_id: bodyTagTarget.episodeId,
      start_offset: start,
      end_offset: end,
      selected_text: selectedText,
    }
    const { data, error: insertError } = await supabase
      .from('body_tag_annotations')
      .insert(payload)
      .select('id, tag_id, thread_id, episode_id, start_offset, end_offset, selected_text, created_at')
      .single()

    if (insertError) {
      if (isMissingRelationError(insertError.message)) {
        setError('body_tag_annotations テーブルが必要です。supabase/schema.sql と supabase/rls.sql を実行してください。')
      } else {
        setError(insertError.message)
      }
      return
    }

    const inserted = data as BodyTagAnnotationRow
    setBodyTagAnnotations((current) => [...current, inserted])
    setBodyTagSelection(null)
  }

  const deleteBodyTagAnnotation = async (annotationId: string) => {
    const { error: deleteError } = await supabase.from('body_tag_annotations').delete().eq('id', annotationId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setBodyTagAnnotations((current) => current.filter((row) => row.id !== annotationId))
  }

  const isParserHistoryActionNoop = (action: ParserHistoryAction) => {
    if (action.kind === 'set_filter_term') return action.beforeEnabled === action.afterEnabled
    if (action.kind === 'set_line_rule') return action.beforeClassification === action.afterClassification
    return action.beforeBody === action.afterBody
  }

  const applyParserHistoryAction = async (
    action: ParserHistoryAction,
    direction: 'forward' | 'backward',
  ) => {
    if (action.kind === 'replace_body_draft') {
      const nextBody = direction === 'forward' ? action.afterBody : action.beforeBody
      setError('')
      setBalloonExportText('')
      setSubItemBodyDraft(nextBody)
      setParsedLines(
        parseScriptLines(
          nextBody,
          filterTerms.map((term) => term.term),
          lineRuleMap,
          speakerProfiles.map((profile) => profile.name),
        ),
      )
      return true
    }

    if (action.kind === 'set_filter_term') {
      const trimmed = action.term.trim()
      if (!trimmed) {
        setError('除去語句を入力してください。')
        return false
      }

      const enableTerm = direction === 'forward' ? action.afterEnabled : action.beforeEnabled
      let nextRows = filterTerms
      if (enableTerm) {
        const { data, error: upsertError } = await supabase
          .from('parser_filter_terms')
          .upsert({ term: trimmed }, { onConflict: 'term' })
          .select('id, term, created_at')
          .maybeSingle()

        if (upsertError) {
          if (isMissingRelationError(upsertError.message)) {
            setError('parser_filter_terms テーブルが必要です。supabase/schema.sql を実行してください。')
          } else {
            setError(upsertError.message)
          }
          return false
        }

        const resolvedRow: FilterTermRow =
          (data as FilterTermRow | null) ?? {
            id: crypto.randomUUID(),
            term: trimmed,
            created_at: new Date().toISOString(),
          }
        nextRows = [...filterTerms.filter((row) => row.term !== trimmed), resolvedRow].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
      } else {
        const existing = filterTerms.find((row) => row.term === trimmed) ?? null
        if (existing) {
          const { error: deleteError } = await supabase.from('parser_filter_terms').delete().eq('id', existing.id)
          if (deleteError) {
            setError(deleteError.message)
            return false
          }
        }
        nextRows = filterTerms.filter((row) => row.term !== trimmed)
      }

      setError('')
      setFilterTerms(nextRows)
      setBalloonExportText('')
      if (action.reparse) {
        applyParserResult(
          lineRuleMap,
          nextRows.map((row) => row.term),
        )
      }
      return true
    }

    const trimmed = action.lineText.trim()
    if (!trimmed) return true

    const nextClassification = direction === 'forward' ? action.afterClassification : action.beforeClassification
    const nextRules = new Map(lineRuleMap)
    if (nextClassification) {
      const { data, error: upsertError } = await supabase
        .from('parser_line_classifications')
        .upsert({ line_text: trimmed, classification: nextClassification }, { onConflict: 'line_text' })
        .select('id, line_text, classification, created_at')
        .maybeSingle()

      if (upsertError) {
        if (isMissingRelationError(upsertError.message)) {
          setError('parser_line_classifications テーブルが必要です。supabase/schema.sql を実行してください。')
        } else {
          setError(upsertError.message)
        }
        return false
      }

      nextRules.set(trimmed, nextClassification)
      setLineRules((current) => {
        if (!data) {
          const fallbackRule: ParserLineRuleRow = {
            id: crypto.randomUUID(),
            line_text: trimmed,
            classification: nextClassification,
            created_at: new Date().toISOString(),
          }
          const withoutOld = current.filter((rule) => rule.line_text !== trimmed)
          return [...withoutOld, fallbackRule]
        }
        const withoutOld = current.filter((rule) => rule.line_text !== trimmed)
        return [...withoutOld, data as ParserLineRuleRow]
      })
    } else {
      const existing = lineRules.find((rule) => rule.line_text === trimmed) ?? null
      if (existing) {
        const { error: deleteError } = await supabase
          .from('parser_line_classifications')
          .delete()
          .eq('id', existing.id)

        if (deleteError) {
          setError(deleteError.message)
          return false
        }
      }
      nextRules.delete(trimmed)
      setLineRules((current) => current.filter((item) => item.line_text !== trimmed))
    }

    setError('')
    setBalloonExportText('')
    if (action.reparse) {
      applyParserResult(nextRules)
    }
    return true
  }

  const commitParserHistoryAction = async (action: ParserHistoryAction) => {
    if (isParserHistoryActionNoop(action)) return true
    const ok = await applyParserHistoryAction(action, 'forward')
    if (!ok) return false
    setParserUndoStack((current) => [...current, action])
    setParserRedoStack([])
    return true
  }

  const undoParserAction = async () => {
    const target = parserUndoStack[parserUndoStack.length - 1]
    if (!target) return
    const ok = await applyParserHistoryAction(target, 'backward')
    if (!ok) return
    setParserUndoStack((current) => current.slice(0, -1))
    setParserRedoStack((current) => [...current, target])
  }

  const redoParserAction = async () => {
    const target = parserRedoStack[parserRedoStack.length - 1]
    if (!target) return
    const ok = await applyParserHistoryAction(target, 'forward')
    if (!ok) return
    setParserRedoStack((current) => current.slice(0, -1))
    setParserUndoStack((current) => [...current, target])
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (isEditableTarget(event.target)) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void undoParserAction()
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        void redoParserAction()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [parserUndoStack, parserRedoStack, filterTerms, lineRuleMap, lineRules, speakerProfiles, subItemBodyDraft])

  const upsertFilterTerm = async (termValue: string, reparse = false) => {
    const trimmed = termValue.trim()
    if (!trimmed) {
      setError('除去語句を入力してください。')
      return false
    }
    return commitParserHistoryAction({
      kind: 'set_filter_term',
      term: trimmed,
      beforeEnabled: filterTerms.some((row) => row.term === trimmed),
      afterEnabled: true,
      reparse,
    })
  }

  const submitFilterTerm = async (event: FormEvent) => {
    event.preventDefault()
    const ok = await upsertFilterTerm(filterTermDraft)
    if (!ok) return
    setFilterTermDraft('')
  }

  const deleteFilterTerm = async (termRow: FilterTermRow) =>
    commitParserHistoryAction({
      kind: 'set_filter_term',
      term: termRow.term,
      beforeEnabled: filterTerms.some((row) => row.term === termRow.term),
      afterEnabled: false,
      reparse: false,
    })

  const clearSpeakerProfileDraft = () => {
    setSpeakerNameDraft('')
    setSpeakerIconUrlDraft('')
    setSpeakerBalloonIdDraft('')
    setSpeakerIconFile(null)
    setEditingSpeakerProfileId(null)
  }

  const closeSpeakerSettingsDialog = () => {
    setSpeakerSettingsDialogOpen(false)
    clearSpeakerProfileDraft()
  }

  const startEditSpeakerProfile = (profile: SpeakerProfileRow) => {
    setEditingSpeakerProfileId(profile.id)
    setSpeakerNameDraft(profile.name)
    setSpeakerIconUrlDraft(profile.icon_url ?? '')
    setSpeakerBalloonIdDraft(profile.speech_balloon_id ?? '')
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
      speech_balloon_id: speakerBalloonIdDraft.trim() || null,
    }

    const { error: upsertError } = editingSpeakerProfileId
      ? await supabase.from('speaker_profiles').update(payload).eq('id', editingSpeakerProfileId)
      : await supabase.from('speaker_profiles').upsert(payload, { onConflict: 'name' })

    if (upsertError) {
      if (upsertError.message.includes('speech_balloon_id')) {
        setError('speaker_profiles テーブルに speech_balloon_id 列が必要です。supabase/schema.sql を実行してください。')
      } else if (isMissingRelationError(upsertError.message)) {
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

  const applyParserResult = (
    ruleMap: Map<string, LineClassification>,
    blockedTermsOverride?: string[],
  ) => {
    const parsed = parseScriptLines(
      subItemBodyDraft,
      blockedTermsOverride ?? filterTerms.map((term) => term.term),
      ruleMap,
      speakerProfiles.map((profile) => profile.name),
    )

    if (parsed.length === 0) {
      setParsedLines([])
      setError('解析できる本文がありませんでした。除去語句か本文を確認してください。')
      return
    }

    setError('')
    setParsedLines(parsed)
    setSubItemBodyDraft(formatParsedRowsToBody(parsed))
  }

  const runSpeakerSplit = async () => {
    const parsed = parseScriptLines(
      subItemBodyDraft,
      filterTerms.map((term) => term.term),
      lineRuleMap,
      speakerProfiles.map((profile) => profile.name),
    )

    if (parsed.length === 0) {
      setParsedLines([])
      setError('解析できる本文がありませんでした。除去語句か本文を確認してください。')
      return
    }

    await commitParserHistoryAction({
      kind: 'replace_body_draft',
      beforeBody: subItemBodyDraft,
      afterBody: formatParsedRowsToBody(parsed),
    })
  }

  const splitDialogueRowSpeakerLine = async (rowIndex: number) => {
    const row = parsedLines[rowIndex]
    if (!row || row.kind !== 'dialogue') return

    const split = splitSpeakerAndDialogueFromSingleLine(row.speaker)
    if (!split) {
      setError('話者行を分離できませんでした。例: 名前：セリフ / 名前「セリフ」')
      return
    }

    const nextBody = parsedLines
      .map((current, index) => {
        if (index !== rowIndex || current.kind !== 'dialogue') {
          return current.kind === 'direction' ? current.content : `${current.speaker}\n${current.content}`
        }
        const carryLine = current.content.trim()
        return carryLine
          ? `${split.speaker}\n${split.dialogue}\n${carryLine}`
          : `${split.speaker}\n${split.dialogue}`
      })
      .join('\n\n')

    await commitParserHistoryAction({
      kind: 'replace_body_draft',
      beforeBody: subItemBodyDraft,
      afterBody: nextBody,
    })
  }

  const deleteParsedRow = async (rowIndex: number) => {
    const target = parsedLines[rowIndex]
    if (!target) return

    const nextBody = parsedLines
      .filter((_, index) => index !== rowIndex)
      .map((row) => (row.kind === 'direction' || row.kind === 'location' ? row.content : `${row.speaker}\n${row.content}`))
      .join('\n\n')

    await commitParserHistoryAction({
      kind: 'replace_body_draft',
      beforeBody: subItemBodyDraft,
      afterBody: nextBody,
    })
  }

  const generateSpeechBalloonExport = () => {
    const parsed =
      parsedLines.length > 0
        ? parsedLines
        : parseScriptLines(
            subItemBodyDraft,
            filterTerms.map((term) => term.term),
            lineRuleMap,
            speakerProfiles.map((profile) => profile.name),
          )
    const dialogueRows = parsed.filter((row): row is ParsedLineRow & { kind: 'dialogue' } => row.kind === 'dialogue')
    if (dialogueRows.length === 0) {
      setError('出力できるセリフがありません。')
      return
    }

    const balloonIdMap = new Map(
      speakerProfiles.map((profile) => [profile.name, (profile.speech_balloon_id ?? '').trim()] as const),
    )
    const fallbackOtherId = (balloonIdMap.get('その他') ?? '').trim()

    const missingSpeakers = new Set<string>()
    const output = dialogueRows
      .map((row) => {
        const speakerId = (balloonIdMap.get(row.speaker) ?? '').trim()
        const resolvedId = speakerId || fallbackOtherId
        if (!resolvedId) {
          missingSpeakers.add(row.speaker)
          return ''
        }
        return `[speech_balloon id="${resolvedId}"]${row.content}[/speech_balloon]`
      })
      .filter(Boolean)
      .join('')

    if (missingSpeakers.size > 0) {
      const names = Array.from(missingSpeakers).join(' / ')
      setError(`吹き出しID未設定の話者があります: ${names}（話者「その他」にIDを設定するとフォールバックできます）`)
      return
    }

    setError('')
    setBalloonExportText(output)
  }

  const copySpeechBalloonExport = async () => {
    if (!balloonExportText) return
    try {
      await navigator.clipboard.writeText(balloonExportText)
    } catch {
      setError('コピーに失敗しました。手動でコピーしてください。')
    }
  }

  const upsertLineRule = async (lineText: string, classification: LineClassification) => {
    const trimmed = lineText.trim()
    if (!trimmed) return
    await commitParserHistoryAction({
      kind: 'set_line_rule',
      lineText: trimmed,
      beforeClassification: lineRuleMap.get(trimmed) ?? null,
      afterClassification: classification,
      reparse: true,
    })
  }

  const removeLineRule = async (rule: ParserLineRuleRow) => {
    await commitParserHistoryAction({
      kind: 'set_line_rule',
      lineText: rule.line_text,
      beforeClassification: lineRuleMap.get(rule.line_text) ?? rule.classification,
      afterClassification: null,
      reparse: true,
    })
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
              <h3>各話タグ設定</h3>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('episodeTag')}>
                ＋ 各話タグを作成
              </button>
              <div className="template-button-list">
                {episodeTagPresets.length === 0 ? (
                  <p className="subtle">各話タグはまだありません</p>
                ) : (
                  episodeTagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button template-button ${
                        selectedSettingsEpisodeTagId === tag.id ? 'active' : ''
                      } ${dragState?.kind === 'episodeTag' && dragState.id === tag.id ? 'dragging' : ''}`}
                      onClick={() => handleSettingsEpisodeTagButton(tag)}
                      draggable
                      onDragStart={(event) => startSortDrag('episodeTag', tag.id, event)}
                      onDragOver={(event) => allowSortDrop('episodeTag', tag.id, event)}
                      onDrop={(event) => void dropSort('episodeTag', tag.id, event)}
                      onDragEnd={() => setDragState(null)}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="settings-section">
              <h3>本文タグ設定</h3>
              <p className="subtle">将来の本文内テキストタグ付け用プリセットです。</p>
              <button type="button" className="ghost-button" onClick={() => openCreatePresetDialog('bodyTag')}>
                ＋ 本文タグを作成
              </button>
              <div className="template-button-list">
                {bodyTagPresets.length === 0 ? (
                  <p className="subtle">本文タグはまだありません</p>
                ) : (
                  bodyTagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button template-button ${
                        selectedSettingsBodyTagId === tag.id ? 'active' : ''
                      } ${dragState?.kind === 'bodyTag' && dragState.id === tag.id ? 'dragging' : ''}`}
                      onClick={() => handleSettingsBodyTagButton(tag)}
                      draggable
                      onDragStart={(event) => startSortDrag('bodyTag', tag.id, event)}
                      onDragOver={(event) => allowSortDrop('bodyTag', tag.id, event)}
                      onDrop={(event) => void dropSort('bodyTag', tag.id, event)}
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
              <div className="settings-history-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void undoParserAction()}
                  disabled={parserUndoStack.length === 0}
                >
                  戻す（Ctrl+Z）
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void redoParserAction()}
                  disabled={parserRedoStack.length === 0}
                >
                  進む（Ctrl+Y）
                </button>
              </div>
              <p className="subtle">除去語句・判定学習・話者行分離に対してUndo/Redoできます。</p>
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
              <h3>判定学習ルール</h3>
              <p className="subtle">本文プレビューで学習した話者/演出/場所の判定です。不要なら削除できます。</p>
              <div className="settings-rule-list">
                {lineRules.length === 0 ? (
                  <p className="subtle">学習ルールはまだありません</p>
                ) : (
                  lineRules.map((rule) => (
                    <article key={rule.id} className="settings-rule-row">
                      <p className="settings-rule-text">
                        <span className={`settings-rule-kind ${rule.classification}`}>{toRuleLabel(rule.classification)}</span>
                        <span className="settings-rule-line">{rule.line_text}</span>
                      </p>
                      <button
                        type="button"
                        className="danger-button mini-action"
                        onClick={() =>
                          openConfirmDialog({
                            title: '判定学習ルールの削除',
                            message: `「${rule.line_text}」の学習ルールを削除します。`,
                            confirmLabel: '削除する',
                            onConfirm: async () => {
                              await removeLineRule(rule)
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

            <section className="settings-section">
              <h3>話者設定（アイコン / 吹き出しID）</h3>
              <p className="subtle">
                話者名で一致した場合にアイコン表示します。吹き出しIDは `[speech_balloon id="..."]` の出力に使います。
              </p>
              <p className="subtle">ID未設定の話者は、話者名「その他」のIDを使って出力します。</p>
              <div className="speaker-settings-summary">
                <p className="subtle">登録済み: {speakerProfiles.length}件</p>
                <button type="button" className="ghost-button" onClick={() => setSpeakerSettingsDialogOpen(true)}>
                  話者一覧を開く
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
                        <span className="mode-toggle-divider" aria-hidden="true" />
                        <button
                          type="button"
                          className={`ghost-button mode-toggle-button ${
                            selectedSubItem.episode_number_start === 0 ? 'active' : ''
                          }`}
                          onClick={() => void saveEpisodeNumberStart(0)}
                          disabled={!selectedSubItem.has_episodes}
                        >
                          0始まり
                        </button>
                        <button
                          type="button"
                          className={`ghost-button mode-toggle-button ${
                            selectedSubItem.episode_number_start === 1 ? 'active' : ''
                          }`}
                          onClick={() => void saveEpisodeNumberStart(1)}
                          disabled={!selectedSubItem.has_episodes}
                        >
                          1始まり
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
                              episodes.map((episode, index) => {
                                const episodeLabel = getEpisodeDisplayLabel(
                                  episode,
                                  index,
                                  selectedSubItem.episode_number_start,
                                  selectedSubItem.episode_labels ?? [],
                                )
                                return (
                                  <div
                                    key={episode.id}
                                    className={`episode-row ${
                                      dragState?.kind === 'episode' && dragState.id === episode.id ? 'dragging' : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className={`list-item episode-list-item ${selectedEpisodeId === episode.id ? 'active' : ''}`}
                                      onClick={() => setSelectedEpisodeId(episode.id)}
                                      draggable
                                      onDragStart={(event) => startSortDrag('episode', episode.id, event)}
                                      onDragOver={(event) => allowSortDrop('episode', episode.id, event)}
                                      onDrop={(event) => void dropSort('episode', episode.id, event)}
                                      onDragEnd={() => setDragState(null)}
                                    >
                                      <span className="episode-row-title">
                                        {episodeLabel} {episode.title}
                                      </span>
                                      {episode.tags && episode.tags.length > 0 && (
                                        <span className="episode-row-tags">{episode.tags.join(' / ')}</span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button mini-action episode-settings-button"
                                      onClick={() => openEpisodeSettings(episode)}
                                    >
                                      設定
                                    </button>
                                  </div>
                                )
                              })
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
                        onChange={(event) => {
                          setSubItemBodyDraft(event.target.value)
                          setBodyTagSelection(null)
                          setBalloonExportText('')
                        }}
                        onSelect={(event) =>
                          handleBodySelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)
                        }
                        placeholder={selectedSubItem.has_episodes ? '選択した話の本文を入力' : 'ここに本文を入力'}
                        disabled={selectedSubItem.has_episodes && !selectedEpisode}
                      />
                      <section className="body-tag-section">
                        <div className="body-tag-head">
                          <p className="subtle">本文で範囲選択してタグを付与できます（付与済みは下のプレビューでホバー確認・削除）</p>
                          <button
                            type="button"
                            className="ghost-button mini-action"
                            onClick={() => openCreatePresetDialog('bodyTag')}
                            disabled={dialogBusy}
                          >
                            ＋ 本文タグ作成
                          </button>
                        </div>
                        {bodyTagSelection ? (
                          <p className="body-tag-selection-text">
                            選択中: {bodyTagSelection.selectedText.length > 80 ? `${bodyTagSelection.selectedText.slice(0, 80)}...` : bodyTagSelection.selectedText}
                          </p>
                        ) : (
                          <p className="subtle">未選択</p>
                        )}
                        <div className="template-button-list">
                          {bodyTagPresets.length === 0 ? (
                            <p className="subtle">本文タグプリセットがありません（上のボタンで作成できます）</p>
                          ) : (
                            bodyTagPresets.map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                className="ghost-button template-button"
                                onClick={() => void addBodyTagToSelection(tag.id)}
                                disabled={!bodyTagSelection || (selectedSubItem.has_episodes && !selectedEpisode)}
                              >
                                {tag.name}
                              </button>
                            ))
                          )}
                        </div>
                        {subItemBodyDraft && (
                          <div className="body-tag-preview" aria-label="本文タグプレビュー">
                            {bodyTagPreviewSegments.map((segment) => {
                              if (segment.kind === 'plain') {
                                return <span key={segment.key}>{segment.text}</span>
                              }
                              return (
                                <span key={segment.key} className="body-tag-mark">
                                  {segment.text}
                                  <span className="body-tag-hover-card">
                                    {segment.group.annotations.map((annotation) => (
                                      <button
                                        key={annotation.id}
                                        type="button"
                                        className="body-tag-hover-chip"
                                        onClick={() => void deleteBodyTagAnnotation(annotation.id)}
                                      >
                                        {(bodyTagPresetMap.get(annotation.tag_id) ?? '削除済みタグ')} ×
                                      </button>
                                    ))}
                                  </span>
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </section>
                      <div className="body-editor-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void runSpeakerSplit()}
                          disabled={selectedSubItem.has_episodes && !selectedEpisode}
                        >
                          話者で振り分け
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={generateSpeechBalloonExport}
                          disabled={selectedSubItem.has_episodes && !selectedEpisode}
                        >
                          吹き出しコード生成
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void copySpeechBalloonExport()}
                          disabled={!balloonExportText}
                        >
                          出力をコピー
                        </button>
                        <button
                          type="button"
                          onClick={saveSelectedSubItemBody}
                          disabled={selectedSubItem.has_episodes && !selectedEpisode}
                        >
                          本文を保存
                        </button>
                      </div>
                      {balloonExportText && (
                        <textarea
                          className="export-output"
                          value={balloonExportText}
                          readOnly
                          aria-label="吹き出しコード出力"
                        />
                      )}

                      {parsedLines.length > 0 && (
                        <div className="parsed-line-list">
                          {parsedLines.map((row, index) => {
                            const profile = speakerProfiles.find((speaker) => speaker.name === row.speaker) ?? null
                            const sourceRuleEntry = lineRuleEntryMap.get(row.sourceLine) ?? null
                            if (row.kind !== 'dialogue') {
                              return (
                                <article key={`${row.kind}-${index}`} className="parsed-line-row parsed-line-row-direction">
                                  <div className="parsed-direction-head">
                                    <div className="parsed-row-meta">
                                      <p className="parsed-direction-label">{row.kind === 'location' ? '場所' : '演出'}</p>
                                      {sourceRuleEntry && (
                                        <span className={`parsed-rule-badge ${sourceRuleEntry.classification}`}>
                                          学習: {toRuleLabel(sourceRuleEntry.classification)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="parsed-row-actions">
                                      <button
                                        type="button"
                                        className="ghost-button parsed-row-action"
                                        onClick={() => void upsertLineRule(row.sourceLine, 'speaker')}
                                      >
                                        話者に学習
                                      </button>
                                      <button
                                        type="button"
                                        className="ghost-button parsed-row-action"
                                        onClick={() => void upsertLineRule(row.sourceLine, 'direction')}
                                      >
                                        演出に学習
                                      </button>
                                      <button
                                        type="button"
                                        className="ghost-button parsed-row-action"
                                        onClick={() => void upsertLineRule(row.sourceLine, 'location')}
                                      >
                                        場所に学習
                                      </button>
                                      <button
                                        type="button"
                                        className="ghost-button parsed-row-action"
                                        onClick={() => void upsertFilterTerm(row.sourceLine, true)}
                                      >
                                        除外語句に学習
                                      </button>
                                      <button
                                        type="button"
                                        className="danger-button parsed-row-action"
                                        onClick={() => void deleteParsedRow(index)}
                                      >
                                        この行を削除
                                      </button>
                                      {sourceRuleEntry && (
                                        <button
                                          type="button"
                                          className="ghost-button parsed-row-action"
                                          onClick={() =>
                                            openConfirmDialog({
                                              title: '学習ルールの解除',
                                              message: `「${sourceRuleEntry.line_text}」の学習ルールを解除します。`,
                                              confirmLabel: '解除する',
                                              onConfirm: async () => {
                                                await removeLineRule(sourceRuleEntry)
                                              },
                                            })
                                          }
                                        >
                                          学習解除
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="parsed-line-text">{row.content}</p>
                                </article>
                              )
                            }
                            return (
                              <article key={`${row.speaker}-${index}`} className="parsed-line-row">
                                <div className="parsed-speaker-col">
                                  <span className="speaker-avatar parsed-speaker-avatar">
                                    {profile?.icon_url ? (
                                      <img src={profile.icon_url} alt={`${row.speaker} icon`} loading="lazy" />
                                    ) : (
                                      <FallbackSpeakerIcon />
                                    )}
                                  </span>
                                  <p className="speaker-name parsed-speaker-name">{row.speaker}</p>
                                  {sourceRuleEntry && (
                                    <span className={`parsed-rule-badge ${sourceRuleEntry.classification}`}>
                                      学習: {toRuleLabel(sourceRuleEntry.classification)}
                                    </span>
                                  )}
                                </div>
                                <div className="parsed-line-content">
                                  <div className="parsed-line-bubble">
                                    <p className="parsed-line-text">{row.content}</p>
                                  </div>
                                  <div className="parsed-row-actions parsed-dialogue-actions">
                                    <button
                                      type="button"
                                      className="ghost-button parsed-row-action"
                                      onClick={() => void upsertLineRule(row.sourceLine, 'speaker')}
                                    >
                                      話者に固定
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button parsed-row-action"
                                      onClick={() => void upsertLineRule(row.sourceLine, 'direction')}
                                    >
                                      演出に学習
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button parsed-row-action"
                                      onClick={() => void upsertLineRule(row.sourceLine, 'location')}
                                    >
                                      場所に学習
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button parsed-row-action"
                                      onClick={() => void splitDialogueRowSpeakerLine(index)}
                                    >
                                      話者行を分離
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button parsed-row-action"
                                      onClick={() => void upsertFilterTerm(row.sourceLine, true)}
                                    >
                                      除外語句に学習
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button parsed-row-action"
                                      onClick={() => void deleteParsedRow(index)}
                                    >
                                      この行を削除
                                    </button>
                                    {sourceRuleEntry && (
                                      <button
                                        type="button"
                                        className="ghost-button parsed-row-action"
                                        onClick={() =>
                                          openConfirmDialog({
                                            title: '学習ルールの解除',
                                            message: `「${sourceRuleEntry.line_text}」の学習ルールを解除します。`,
                                            confirmLabel: '解除する',
                                            onConfirm: async () => {
                                              await removeLineRule(sourceRuleEntry)
                                            },
                                          })
                                        }
                                      >
                                        学習解除
                                      </button>
                                    )}
                                  </div>
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
                <div className="content-head content-head-with-action">
                  <div>
                    <h2>{selectedItem ? `項目: ${selectedItem.title}` : '項目を選択してください'}</h2>
                    <p className="subtle">
                      {selectedItem
                        ? '構造: 項目内項目 -> 本文、項目 -> 日付/項目タグ'
                        : '左の一覧から項目を選ぶか、新しく作成してください。'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={openItemSettingsDialog}
                    disabled={!selectedItemId}
                  >
                    設定
                  </button>
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
                  <h3>日付（単日 / 範囲）</h3>
                  <p className="subtle">並び順は開始日基準です。単日の場合は開始日だけ入力してください。</p>
                  <div className="item-action-row">
                    <input
                      type="date"
                      value={mainScheduledFrom}
                      onChange={(event) => void handleMainDateFromChange(event.target.value)}
                      disabled={!selectedItemId}
                      aria-label="開始日"
                    />
                    <input
                      type="date"
                      value={mainScheduledTo}
                      onChange={(event) => void handleMainDateToChange(event.target.value)}
                      disabled={!selectedItemId}
                      aria-label="終了日"
                    />
                  </div>
                  <div className="date-tag-preview">
                    <p className="subtle">現在の項目タグ</p>
                    {mainSelectedTags.length === 0 ? (
                      <p className="subtle">タグなし</p>
                    ) : (
                      <div className="date-tag-list">
                        {mainSelectedTags.map((tagName) => (
                          <span key={tagName} className="tag-chip">
                            {tagName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

              </>
            )}
          </section>
        )}
      </section>

      {presetDialog && (
        <div className="overlay overlay-priority">
          <form className="dialog-panel" onSubmit={onSubmitPresetDialogForm}>
            <h2>
              {presetDialog.kind === 'item'
                ? '項目の詳細設定'
                : presetDialog.kind === 'template'
                ? presetDialog.mode === 'create'
                  ? '項目内項目を作成'
                  : '項目内項目の詳細設定'
                : presetDialog.kind === 'tag'
                ? presetDialog.mode === 'create'
                  ? '項目タグを作成'
                  : '項目タグの詳細設定'
                : presetDialog.kind === 'episodeTag'
                ? presetDialog.mode === 'create'
                  ? '各話タグを作成'
                  : '各話タグの詳細設定'
                : presetDialog.mode === 'create'
                ? '本文タグを作成'
                : '本文タグの詳細設定'}
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

      {itemSettingsDialog && (
        <div className="overlay">
          <form
            className="dialog-panel"
            onSubmit={(event) => {
              event.preventDefault()
              void saveItemSettingsDialog()
            }}
          >
            <h2>項目の設定</h2>
            <section className="dialog-field">
              <div className="dialog-section-head">
                <p className="subtle">項目タグ（並び替え: ドラッグ）</p>
                <button
                  type="button"
                  className="ghost-button mini-action"
                  onClick={() => openCreatePresetDialog('tag')}
                  disabled={dialogBusy}
                >
                  ＋
                </button>
              </div>
              <div className="tag-picker">
                {tagPresets.length === 0 ? (
                  <p className="subtle">項目タグがありません。＋で作成してください。</p>
                ) : (
                  tagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button tag-preset-button ${
                        itemSettingsDialog.selectedTags.includes(tag.name) ? 'active' : ''
                      }`}
                      onClick={() => toggleItemSettingsTag(tag.name)}
                      disabled={dialogBusy}
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
              {itemSettingsDialog.selectedTags.length > 0 && (
                <div className="selected-tag-list">
                  {itemSettingsDialog.selectedTags.map((tagName) => (
                    <button
                      key={tagName}
                      type="button"
                      className="selected-tag-chip"
                      onClick={() => toggleItemSettingsTag(tagName)}
                      disabled={dialogBusy}
                    >
                      {tagName} ×
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="dialog-field">
              <div className="dialog-section-head">
                <p className="subtle">項目内項目を追加（並び替え: ドラッグ）</p>
                <button
                  type="button"
                  className="ghost-button mini-action"
                  onClick={() => openCreatePresetDialog('template')}
                  disabled={dialogBusy}
                >
                  ＋
                </button>
              </div>
              <div className="template-button-list">
                {subItemTemplates.length === 0 ? (
                  <p className="subtle">項目内項目がありません。＋で作成してください。</p>
                ) : (
                  subItemTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`ghost-button template-button ${
                        itemSettingsDialog.selectedTemplateIds.includes(template.id) ? 'active' : ''
                      }`}
                      onClick={() => toggleItemSettingsTemplate(template.id)}
                      disabled={dialogBusy}
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
              {itemSettingsDialog.selectedTemplateIds.length > 0 && (
                <div className="selected-template-list">
                  {itemSettingsDialog.selectedTemplateIds.map((templateId) => {
                    const templateName =
                      subItemTemplates.find((template) => template.id === templateId)?.title ?? templateId
                    return (
                      <button
                        key={templateId}
                        type="button"
                        className="selected-template-chip"
                        onClick={() => toggleItemSettingsTemplate(templateId)}
                        disabled={dialogBusy}
                      >
                        {templateName} ×
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <div className="dialog-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setItemSettingsDialog(null)}
                disabled={dialogBusy}
              >
                閉じる
              </button>
              <button type="submit" disabled={dialogBusy}>
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {episodeSettingsDialog && (
        <div className="overlay">
          <form
            className="dialog-panel"
            onSubmit={(event) => {
              event.preventDefault()
              void saveEpisodeSettingsDialog()
            }}
          >
            <h2>話の設定</h2>
            <label className="dialog-field">
              話ラベル（任意）
              <input
                value={episodeSettingsDialog.labelDraft}
                onChange={(event) =>
                  setEpisodeSettingsDialog((current) =>
                    current ? { ...current, labelDraft: event.target.value } : current,
                  )
                }
                placeholder="例: 前編 / 後編 / 第0話"
                disabled={dialogBusy}
              />
            </label>
            <section className="dialog-field">
              <div className="dialog-section-head">
                <p className="subtle">各話タグ（並び替え: ドラッグ）</p>
                <button
                  type="button"
                  className="ghost-button mini-action"
                  onClick={() => openCreatePresetDialog('episodeTag')}
                  disabled={dialogBusy}
                >
                  ＋
                </button>
              </div>
              <div className="template-button-list">
                {episodeTagPresets.length === 0 ? (
                  <p className="subtle">各話タグがありません。＋で作成してください。</p>
                ) : (
                  episodeTagPresets.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`ghost-button template-button ${
                        episodeSettingsDialog.selectedTags.includes(tag.name) ? 'active' : ''
                      }`}
                      onClick={() => toggleEpisodeSettingsTag(tag.name)}
                      disabled={dialogBusy}
                      draggable
                      onDragStart={(event) => startSortDrag('episodeTag', tag.id, event)}
                      onDragOver={(event) => allowSortDrop('episodeTag', tag.id, event)}
                      onDrop={(event) => void dropSort('episodeTag', tag.id, event)}
                      onDragEnd={() => setDragState(null)}
                    >
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </section>
            {episodeSettingsDialog.selectedTags.length > 0 && (
              <div className="selected-tag-list">
                {episodeSettingsDialog.selectedTags.map((tagName) => (
                  <button
                    key={tagName}
                    type="button"
                    className="selected-tag-chip"
                    onClick={() => toggleEpisodeSettingsTag(tagName)}
                    disabled={dialogBusy}
                  >
                    {tagName} ×
                  </button>
                ))}
              </div>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setEpisodeSettingsDialog(null)}
                disabled={dialogBusy}
              >
                閉じる
              </button>
              <button type="submit" disabled={dialogBusy}>
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {speakerSettingsDialogOpen && (
        <div className="overlay overlay-priority">
          <section className="dialog-panel speaker-dialog-panel">
            <div className="speaker-dialog-head">
              <h2>話者一覧・編集</h2>
              <p className="subtle">一覧から選択して、名前・吹き出しID・アイコンをいつでも変更できます。</p>
            </div>

            <div className="speaker-dialog-layout">
              <form className="stack-form speaker-dialog-form" onSubmit={submitSpeakerProfile}>
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
                <input
                  value={speakerBalloonIdDraft}
                  onChange={(event) => setSpeakerBalloonIdDraft(event.target.value)}
                  placeholder="吹き出しID（任意） 例: 28"
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

              <div className="speaker-dialog-list-wrap">
                <div className="speaker-dialog-list-head">
                  <p className="subtle">登録済み話者</p>
                  <button type="button" className="ghost-button mini-action" onClick={clearSpeakerProfileDraft}>
                    新規追加
                  </button>
                </div>
                <div className="speaker-profile-list speaker-dialog-list">
                  {speakerProfiles.length === 0 ? (
                    <p className="subtle">話者プロフィールはまだありません</p>
                  ) : (
                    speakerProfiles.map((profile) => (
                      <article
                        key={profile.id}
                        className={`speaker-profile-row ${editingSpeakerProfileId === profile.id ? 'active' : ''}`}
                      >
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
                            <span className="subtle">
                              吹き出しID: {profile.speech_balloon_id ? profile.speech_balloon_id : '未設定'}
                            </span>
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
              </div>
            </div>

            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeSpeakerSettingsDialog}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <div className="overlay overlay-confirm">
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

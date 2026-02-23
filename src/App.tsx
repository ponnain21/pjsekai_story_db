import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type NodeType = 'game' | 'arc' | 'session'
type EntryKind = 'utterance' | 'stage' | 'note'

const entryKindLabel: Record<EntryKind, string> = {
  utterance: 'セリフ',
  stage: 'ト書き',
  note: 'メモ',
}

type NodeRow = {
  id: string
  type: NodeType
  title: string
  parent_id: string | null
  created_at: string
}

type ThreadRow = {
  id: string
  node_id: string
  title: string
  created_at: string
}

type EntryRow = {
  id: string
  thread_id: string
  kind: EntryKind
  speaker_name: string | null
  content: string
  created_at: string
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'denied'>(
    'unknown',
  )
  const [authLoading, setAuthLoading] = useState(false)

  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [entries, setEntries] = useState<EntryRow[]>([])

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const [threadTitle, setThreadTitle] = useState('')
  const [entryKind, setEntryKind] = useState<EntryKind>('utterance')
  const [speakerName, setSpeakerName] = useState('')
  const [entryContent, setEntryContent] = useState('')

  const [error, setError] = useState('')
  const singleNode = nodes[0] ?? null

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }
    loadSession()
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

  const loadNodes = async () => {
    const { data, error: loadError } = await supabase
      .from('nodes')
      .select('id, type, title, parent_id, created_at')
      .order('created_at', { ascending: true })
    if (loadError) {
      setError(loadError.message)
      return
    }
    let loadedNodes = (data ?? []) as NodeRow[]
    if (loadedNodes.length === 0) {
      const { error: createError } = await supabase.from('nodes').insert({
        type: 'game' satisfies NodeType,
        title: 'メイン',
        parent_id: null,
      })
      if (createError) {
        setError(createError.message)
        return
      }
      const { data: refetchedNodes, error: refetchError } = await supabase
        .from('nodes')
        .select('id, type, title, parent_id, created_at')
        .order('created_at', { ascending: true })
      if (refetchError) {
        setError(refetchError.message)
        return
      }
      loadedNodes = (refetchedNodes ?? []) as NodeRow[]
    }
    setNodes(loadedNodes.slice(0, 1))
  }

  const loadThreads = async (nodeId: string) => {
    const { data, error: loadError } = await supabase
      .from('threads')
      .select('id, node_id, title, created_at')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true })
    if (loadError) {
      setError(loadError.message)
      return
    }
    setThreads((data ?? []) as ThreadRow[])
  }

  const loadEntries = async (threadId: string) => {
    const { data, error: loadError } = await supabase
      .from('entries')
      .select('id, thread_id, kind, speaker_name, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    if (loadError) {
      setError(loadError.message)
      return
    }
    setEntries((data ?? []) as EntryRow[])
  }

  useEffect(() => {
    if (!session || accessStatus !== 'allowed') {
      setNodes([])
      setThreads([])
      setEntries([])
      setSelectedThreadId(null)
      return
    }
    loadNodes()
  }, [session, accessStatus])

  useEffect(() => {
    if (!singleNode) {
      setThreads([])
      setSelectedThreadId(null)
      return
    }
    loadThreads(singleNode.id)
  }, [singleNode?.id])

  useEffect(() => {
    if (!selectedThreadId) {
      setEntries([])
      return
    }
    loadEntries(selectedThreadId)
  }, [selectedThreadId])

  const loginWithGoogle = async () => {
    setError('')
    setAuthLoading(true)
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
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

  const submitThread = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!singleNode) {
      setError('固定ノードが見つかりません。再読み込みしてください。')
      return
    }
    if (!threadTitle.trim()) {
      setError('スレッド名は必須です。')
      return
    }
    const { error: insertError } = await supabase.from('threads').insert({
      node_id: singleNode.id,
      title: threadTitle.trim(),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setThreadTitle('')
    await loadThreads(singleNode.id)
  }

  const submitEntry = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!selectedThreadId) {
      setError('先にスレッドを選択してください。')
      return
    }
    if (!entryContent.trim()) {
      setError('エントリー内容は必須です。')
      return
    }
    if (entryKind === 'utterance' && !speakerName.trim()) {
      setError('セリフの場合は話者名が必須です。')
      return
    }
    const { error: insertError } = await supabase.from('entries').insert({
      thread_id: selectedThreadId,
      kind: entryKind,
      speaker_name: entryKind === 'utterance' ? speakerName.trim() : null,
      content: entryContent.trim(),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setEntryContent('')
    if (entryKind === 'utterance') setSpeakerName('')
    await loadEntries(selectedThreadId)
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
          <h1>プロセカ ストーリーDB</h1>
          <p>{session.user.email}</p>
        </div>
        <button onClick={logout}>ログアウト</button>
      </header>

      {error && <p className="error global-error">{error}</p>}

      <section className="columns">
        <section className="panel">
          <h2>スレッド</h2>
          <p className="subtle">{singleNode ? `ノード: ${singleNode.title}` : 'ノード準備中'}</p>
          <div className="list">
            {threads.map((thread) => (
              <button
                key={thread.id}
                className={`list-item ${selectedThreadId === thread.id ? 'active' : ''}`}
                onClick={() => setSelectedThreadId(thread.id)}
              >
                {thread.title}
              </button>
            ))}
          </div>

          <form className="stack-form" onSubmit={submitThread}>
            <h3>スレッド追加</h3>
            <label>
              タイトル
              <input
                value={threadTitle}
                onChange={(event) => setThreadTitle(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={!singleNode}>
              追加
            </button>
          </form>
        </section>

        <section className="panel entry-panel">
          <h2>エントリー</h2>
          <p className="subtle">
            {selectedThreadId ? 'チャット表示' : 'スレッドを選択してください'}
          </p>
          <div className="entry-list">
            {entries.map((entry) =>
              entry.kind === 'utterance' ? (
                <article className="entry utterance" key={entry.id}>
                  <p className="speaker">{entry.speaker_name || '不明'}</p>
                  <p>{entry.content}</p>
                </article>
              ) : (
                <article className={`entry divider ${entry.kind}`} key={entry.id}>
                  <p>{entryKindLabel[entry.kind]}</p>
                  <p>{entry.content}</p>
                </article>
              ),
            )}
          </div>
          <form className="stack-form entry-form" onSubmit={submitEntry}>
            <h3>エントリー追加</h3>
            <label>
              種別
              <select
                value={entryKind}
                onChange={(event) => setEntryKind(event.target.value as EntryKind)}
              >
                <option value="utterance">{entryKindLabel.utterance}</option>
                <option value="stage">{entryKindLabel.stage}</option>
                <option value="note">{entryKindLabel.note}</option>
              </select>
            </label>
            {entryKind === 'utterance' && (
              <label>
                話者名
                <input
                  value={speakerName}
                  onChange={(event) => setSpeakerName(event.target.value)}
                  required
                />
              </label>
            )}
            <label>
              内容
              <textarea
                rows={4}
                value={entryContent}
                onChange={(event) => setEntryContent(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={!selectedThreadId}>
              追加
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}

export default App

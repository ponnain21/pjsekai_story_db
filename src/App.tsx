import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type NodeType = 'game' | 'arc' | 'session'
type EntryKind = 'utterance' | 'stage' | 'note'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [entries, setEntries] = useState<EntryRow[]>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const [nodeType, setNodeType] = useState<NodeType>('game')
  const [nodeTitle, setNodeTitle] = useState('')
  const [threadTitle, setThreadTitle] = useState('')
  const [entryKind, setEntryKind] = useState<EntryKind>('utterance')
  const [speakerName, setSpeakerName] = useState('')
  const [entryContent, setEntryContent] = useState('')

  const [error, setError] = useState('')

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

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

  const loadNodes = async () => {
    const { data, error: loadError } = await supabase
      .from('nodes')
      .select('id, type, title, parent_id, created_at')
      .order('created_at', { ascending: true })
    if (loadError) {
      setError(loadError.message)
      return
    }
    setNodes((data ?? []) as NodeRow[])
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
    if (!session) {
      setNodes([])
      setThreads([])
      setEntries([])
      setSelectedNodeId(null)
      setSelectedThreadId(null)
      return
    }
    loadNodes()
  }, [session])

  useEffect(() => {
    if (!selectedNodeId) {
      setThreads([])
      setSelectedThreadId(null)
      return
    }
    loadThreads(selectedNodeId)
  }, [selectedNodeId])

  useEffect(() => {
    if (!selectedThreadId) {
      setEntries([])
      return
    }
    loadEntries(selectedThreadId)
  }, [selectedThreadId])

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setAuthLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      setError(signInError.message)
    } else {
      setPassword('')
    }
    setAuthLoading(false)
  }

  const logout = async () => {
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  const submitNode = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!nodeTitle.trim()) {
      setError('Node title is required.')
      return
    }
    if ((nodeType === 'arc' || nodeType === 'session') && !selectedNodeId) {
      setError('Select a parent node before creating arc/session.')
      return
    }
    const { error: insertError } = await supabase.from('nodes').insert({
      type: nodeType,
      title: nodeTitle.trim(),
      parent_id: nodeType === 'game' ? null : selectedNodeId,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNodeTitle('')
    await loadNodes()
  }

  const submitThread = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!selectedNodeId) {
      setError('Select a node first.')
      return
    }
    if (!threadTitle.trim()) {
      setError('Thread title is required.')
      return
    }
    const { error: insertError } = await supabase.from('threads').insert({
      node_id: selectedNodeId,
      title: threadTitle.trim(),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setThreadTitle('')
    await loadThreads(selectedNodeId)
  }

  const submitEntry = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!selectedThreadId) {
      setError('Select a thread first.')
      return
    }
    if (!entryContent.trim()) {
      setError('Entry content is required.')
      return
    }
    if (entryKind === 'utterance' && !speakerName.trim()) {
      setError('Speaker name is required for utterance.')
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

  const getNodeDepth = (node: NodeRow) => {
    let depth = 0
    let currentParentId = node.parent_id
    while (currentParentId) {
      const parent = nodes.find((item) => item.id === currentParentId)
      if (!parent) break
      depth += 1
      currentParentId = parent.parent_id
    }
    return depth
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={submitLogin}>
          <h1>Story DB Login</h1>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={authLoading}>
            {authLoading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Project Sekai Story DB</h1>
          <p>{session.user.email}</p>
        </div>
        <button onClick={logout}>Logout</button>
      </header>

      {error && <p className="error global-error">{error}</p>}

      <section className="columns">
        <aside className="panel">
          <h2>Nodes</h2>
          <div className="list">
            {nodes.map((node) => (
              <button
                key={node.id}
                className={`list-item ${selectedNodeId === node.id ? 'active' : ''}`}
                style={{ paddingLeft: `${0.75 + getNodeDepth(node) * 1}rem` }}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span className="item-type">{node.type}</span>
                <span>{node.title}</span>
              </button>
            ))}
          </div>

          <form className="stack-form" onSubmit={submitNode}>
            <h3>Add Node</h3>
            <label>
              Type
              <select
                value={nodeType}
                onChange={(event) => setNodeType(event.target.value as NodeType)}
              >
                <option value="game">game</option>
                <option value="arc">arc</option>
                <option value="session">session</option>
              </select>
            </label>
            <label>
              Title
              <input
                value={nodeTitle}
                onChange={(event) => setNodeTitle(event.target.value)}
                required
              />
            </label>
            <button type="submit">Add Node</button>
          </form>
        </aside>

        <section className="panel">
          <h2>Threads</h2>
          <p className="subtle">
            {selectedNode ? `Node: ${selectedNode.title}` : 'Select a node'}
          </p>
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
            <h3>Add Thread</h3>
            <label>
              Title
              <input
                value={threadTitle}
                onChange={(event) => setThreadTitle(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={!selectedNodeId}>
              Add Thread
            </button>
          </form>
        </section>

        <section className="panel entry-panel">
          <h2>Entries</h2>
          <p className="subtle">
            {selectedThreadId ? 'Chat View' : 'Select a thread'}
          </p>
          <div className="entry-list">
            {entries.map((entry) =>
              entry.kind === 'utterance' ? (
                <article className="entry utterance" key={entry.id}>
                  <p className="speaker">{entry.speaker_name || 'Unknown'}</p>
                  <p>{entry.content}</p>
                </article>
              ) : (
                <article className={`entry divider ${entry.kind}`} key={entry.id}>
                  <p>{entry.kind.toUpperCase()}</p>
                  <p>{entry.content}</p>
                </article>
              ),
            )}
          </div>
          <form className="stack-form entry-form" onSubmit={submitEntry}>
            <h3>Add Entry</h3>
            <label>
              Kind
              <select
                value={entryKind}
                onChange={(event) => setEntryKind(event.target.value as EntryKind)}
              >
                <option value="utterance">utterance</option>
                <option value="stage">stage</option>
                <option value="note">note</option>
              </select>
            </label>
            {entryKind === 'utterance' && (
              <label>
                Speaker Name
                <input
                  value={speakerName}
                  onChange={(event) => setSpeakerName(event.target.value)}
                  required
                />
              </label>
            )}
            <label>
              Content
              <textarea
                rows={4}
                value={entryContent}
                onChange={(event) => setEntryContent(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={!selectedThreadId}>
              Add Entry
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}

export default App

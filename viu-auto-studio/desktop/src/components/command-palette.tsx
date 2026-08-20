import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { api } from "@/services/api"
import { charactersGlobalApi } from "@/services/pages-api"
import { APP_NAV_ITEMS, Dialog, DialogContent, DialogTitle } from "@/components/design-system"
import type { Project } from "@/types"
import { useAppStore } from "@/stores/app-store"

export function CommandPalette() {
  const navigate = useNavigate()
  const { searchOpen, setSearchOpen } = useAppStore()
  const [query, setQuery] = useState("")
  const [projects, setProjects] = useState<Project[]>([])
  const [characters, setCharacters] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(!useAppStore.getState().searchOpen)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setSearchOpen])

  useEffect(() => {
    if (!searchOpen) return
    setQuery("")
    api.listProjects().then(setProjects).catch(() => setProjects([]))
    charactersGlobalApi.list().then((list) => setCharacters(list)).catch(() => setCharacters([]))
  }, [searchOpen])

  const q = query.trim().toLowerCase()
  const matchedProjects = useMemo(
    () => projects.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.topic || "").toLowerCase().includes(q)).slice(0, 6),
    [projects, q],
  )
  const matchedCharacters = useMemo(
    () => characters.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 4),
    [characters, q],
  )
  const matchedNav = useMemo(
    () => APP_NAV_ITEMS.filter((item) => !q || item.label.toLowerCase().includes(q)),
    [q],
  )

  const go = (path: string) => {
    setSearchOpen(false)
    navigate(path)
  }

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="max-w-xl border-[#24313A] bg-[#141D22] p-0">
        <DialogTitle className="sr-only">Tìm kiếm</DialogTitle>
        <div className="flex items-center gap-2 border-b border-[#24313A] px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm dự án, nhân vật, flow..."
            className="h-9 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[420px] space-y-3 overflow-y-auto p-3">
          <Section title="Điều hướng">
            {matchedNav.map((item) => (
              <button key={item.to} type="button" onClick={() => go(item.to)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]">
                <span>{item.label}</span>
                <span className="text-[11px] text-slate-500">{item.to}</span>
              </button>
            ))}
          </Section>
          <Section title="Dự án">
            {matchedProjects.length === 0 ? (
              <Empty text="Không có dự án khớp" />
            ) : (
              matchedProjects.map((p) => (
                <button key={p.id} type="button" onClick={() => go(`/projects/${p.id}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]">
                  <span className="truncate">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.status}</span>
                </button>
              ))
            )}
          </Section>
          <Section title="Nhân vật">
            {matchedCharacters.length === 0 ? (
              <Empty text="Không có nhân vật khớp" />
            ) : (
              matchedCharacters.map((c) => (
                <button key={c.id} type="button" onClick={() => go("/characters")} className="flex w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]">
                  {c.name}
                </button>
              ))
            )}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-2 text-xs text-slate-500">{text}</div>
}

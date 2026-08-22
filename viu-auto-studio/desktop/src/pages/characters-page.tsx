import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Copy, Search, Star, MoreVertical, UserCheck, Trash2, Upload, PencilLine } from "lucide-react"
import { api } from "@/services/api"
import { charactersGlobalApi, type CharacterGlobalRead } from "@/services/pages-api"

import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

export default function CharactersPage() {
  const navigate = useNavigate()
  const [chars, setChars] = useState<CharacterGlobalRead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detail, setDetail] = useState<CharacterGlobalRead | null>(null)
  const [form, setForm] = useState({
    name: "", code: "", role: "Nhân vật chính", appearance: "",
    negative_prompt: "", identity_prompt: "", face_lock: 95, outfit_lock: 90,
  })
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [profileInput, setProfileInput] = useState<HTMLInputElement | null>(null)
  const [refInput, setRefInput] = useState<HTMLInputElement | null>(null)
  const [refTargetId, setRefTargetId] = useState<number | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await charactersGlobalApi.list()
      setChars(list)
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return chars.filter((c) => {
      const matchName = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || "").toLowerCase().includes(search.toLowerCase())
      const matchRole = filterRole === "all" || c.role === filterRole
      return matchName && matchRole
    })
  }, [chars, search, filterRole])

  const openCreate = () => {
    setForm({ name: "", code: "", role: "Nhân vật chính", appearance: "", negative_prompt: "", identity_prompt: "", face_lock: 95, outfit_lock: 90 })
    setDetail(null)
    setDialogOpen(true)
  }

  const openEdit = (c: CharacterGlobalRead) => {
    setForm({
      name: c.name, code: c.code || "", role: c.role || "Nhân vật chính",
      appearance: c.appearance || "", negative_prompt: c.negative_prompt || "",
      identity_prompt: c.identity_prompt || "", face_lock: c.face_lock ?? 95,
      outfit_lock: c.outfit_lock ?? 90,
    })
    setDetail(c)
    setDialogOpen(true)
  }

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Tên nhân vật không được để trống", variant: "destructive" })
      return
    }
    try {
      const payload = {
        name: form.name.trim(), code: form.code.trim() || undefined,
        role: form.role, appearance: form.appearance || undefined,
        negative: form.negative_prompt || undefined,
        identity_prompt: form.identity_prompt || undefined,
        face_lock: form.face_lock, outfit_lock: form.outfit_lock,
      }
      if (detail) {
        await charactersGlobalApi.update(detail.id, payload)
        toast({ title: "Đã cập nhật hồ sơ nhân vật" })
      } else {
        await charactersGlobalApi.create(payload)
        toast({ title: "Đã tạo nhân vật toàn cục" })
      }

      setDialogOpen(false)
      load()
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    }
  }

  const importProfile = async (file: File | null) => {
    if (!file) return
    try {
      const raw = JSON.parse(await file.text()) as { characters?: unknown } | unknown[]
      const profiles = (Array.isArray(raw) ? raw : Array.isArray(raw.characters) ? raw.characters : [raw]) as Array<Record<string, unknown>>
      const valid = profiles.filter((profile) => typeof profile.name === "string" && profile.name.trim())
      if (!valid.length) throw new Error("File không chứa hồ sơ nhân vật hợp lệ")
      for (const profile of valid) {
        const text = (key: string) => typeof profile[key] === "string" ? String(profile[key]) : undefined
        await charactersGlobalApi.create({
          name: String(profile.name).trim(), code: text("code"), role: text("role"),
          appearance: text("appearance"), negative: text("negative_prompt") || text("negative"),
          identity_prompt: text("identity_prompt"), face_lock: Number(profile.face_lock ?? 95),
          outfit_lock: Number(profile.outfit_lock ?? 90), seed: profile.seed == null ? null : Number(profile.seed),
        })
      }
      toast({ title: `Đã nhập ${valid.length} hồ sơ nhân vật` })
      await load()
    } catch (e) {
      toast({ title: "Nhập hồ sơ thất bại", description: String(e), variant: "destructive" })
    } finally {
      if (profileInput) profileInput.value = ""
    }
  }

  const addReference = async (file: File | null) => {
    if (!file || !refTargetId) return
    try {
      const uploaded = await api.uploadMedia(file)
      await charactersGlobalApi.addRef(refTargetId, uploaded.path, "face")
      toast({ title: "Đã thêm ảnh tham chiếu", description: file.name })
      await load()
    } catch (e) {
      toast({ title: "Thêm ảnh tham chiếu thất bại", description: String(e), variant: "destructive" })
    } finally {
      setRefTargetId(null)
      if (refInput) refInput.value = ""
    }
  }

  const deleteChar = async (id: number) => {

    try {
      await charactersGlobalApi.delete(id)
      toast({ title: "Đã xóa nhân vật" })
      setDeleteId(null)
      load()
    } catch (e) {
      const msg = String(e)
      if (msg.includes("đang được sử dụng")) {
        toast({ title: "Không thể xóa nhân vật đang được sử dụng trong dự án/cảnh", variant: "destructive" })
      } else {
        toast({ title: "Lỗi", description: msg, variant: "destructive" })
      }
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Nhân vật — Thư viện nhận diện dùng lại giữa các dự án
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Hồ sơ nhận diện nhân vật toàn cục, bộ ảnh tham chiếu, khóa nhận diện và lịch sử nhất quán.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={setProfileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void importProfile(e.target.files?.[0] || null)}
          />
          <input
            ref={setRefInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void addReference(e.target.files?.[0] || null)}
          />
          <Button variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={() => profileInput?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Nhập hồ sơ JSON
          </Button>

          <Button onClick={openCreate} className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" /> Tạo nhân vật
          </Button>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40">Thư viện nhân vật</Badge>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Tìm theo tên hoặc mã nhân vật…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-8 bg-[#141d22] border-white/10"
            />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-40 bg-[#141d22] border-white/10">
              <SelectValue placeholder="Vai trò" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả vai trò</SelectItem>
              <SelectItem value="Nhân vật chính">Nhân vật chính</SelectItem>
              <SelectItem value="Người dẫn chuyện">Người dẫn chuyện</SelectItem>
              <SelectItem value="Nhân vật phụ">Nhân vật phụ</SelectItem>
              <SelectItem value="Khách mời">Khách mời</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-[#141d22]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#141d22] p-12 text-center">
          <UserCheck className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">Chưa có nhân vật toàn cục. Bấm "Tạo nhân vật" để bắt đầu.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border border-white/5 bg-[#141d22] p-4 transition-colors hover:border-amber-500/30"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-sm font-bold text-white">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.code ? `${c.code} · ` : ""}{c.role || "Chưa xác định"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-slate-600 hover:text-amber-400" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" className="rounded-md p-1 text-slate-500 hover:text-slate-200">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 bg-[#1a2229] border-white/10">
                      <div className="space-y-1">
                        <Button variant="ghost" onClick={() => openEdit(c)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5">
                          <PencilLine className="h-4 w-4" /> Sửa hồ sơ
                        </Button>
                        <Button variant="ghost" onClick={() => setDeleteId(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-400 hover:bg-white/5">
                          <Trash2 className="h-4 w-4" /> Xóa
                        </Button>
                        <Button variant="ghost" onClick={() => navigate(`/projects`)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5">
                          <UserCheck className="h-4 w-4" /> Dùng cho dự án
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Khóa nhận diện</span>
                  <span>{c.face_lock ?? 95}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                    style={{ width: `${c.face_lock ?? 95}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Badge variant="outline" className="border-white/10 text-slate-400">
                  Đang dùng trong {c.used_projects ?? 0} dự án
                </Badge>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  {(c.refs?.length ?? 0) > 0 ? `${c.refs!.length} ảnh tham chiếu` : "Chưa có ảnh"}
                </Badge>
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[11px] text-amber-300" onClick={() => { setRefTargetId(c.id); refInput?.click() }}>
                  <Upload className="mr-1 h-3 w-3" /> Thêm ảnh
                </Button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl bg-[#0c1318] border-white/10 text-slate-100">
          <DialogHeader>
            <DialogTitle>{detail ? "Sửa hồ sơ nhân vật" : "Tạo nhân vật mới"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs text-slate-400">Tên nhân vật *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#141d22] border-white/10" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-slate-400">Mã nhân vật (MCR, SC1…)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="bg-[#141d22] border-white/10" />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-slate-400">Vai trò</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-[#141d22] border-white/10" />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-slate-400">Diện mạo (mô tả ngoại hình, tóc, trang phục)</Label>
              <Textarea value={form.appearance} onChange={(e) => setForm({ ...form, appearance: e.target.value })} className="bg-[#141d22] border-white/10 min-h-16" />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-slate-400">Prompt nhận diện (English)</Label>
              <Textarea value={form.identity_prompt} onChange={(e) => setForm({ ...form, identity_prompt: e.target.value })} className="bg-[#141d22] border-white/10 min-h-14" />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                Face lock <span>{form.face_lock}%</span>
              </Label>
              <Slider value={[form.face_lock]} onValueChange={(v) => setForm({ ...form, face_lock: v[0] })} max={100} />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                Outfit lock <span>{form.outfit_lock}%</span>
              </Label>
              <Slider value={[form.outfit_lock]} onValueChange={(v) => setForm({ ...form, outfit_lock: v[0] })} max={100} />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-slate-400">Negative prompt</Label>
              <Textarea value={form.negative_prompt} onChange={(e) => setForm({ ...form, negative_prompt: e.target.value })} className="bg-[#141d22] border-white/10 min-h-12" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10 text-slate-300">Hủy</Button>
            <Button onClick={submit} className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white hover:opacity-90">
              {detail ? "Lưu hồ sơ" : "Tạo nhân vật"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm bg-[#0c1318] border-white/10 text-slate-100">
          <DialogHeader><DialogTitle>Xóa nhân vật?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-400">
            Nhân vật đang được sử dụng trong 1+ dự án/cảnh sẽ không thể xóa. Bạn có chắc muốn xóa nhân vật này?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-white/10 text-slate-300">Hủy</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteChar(deleteId)}>Xóa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

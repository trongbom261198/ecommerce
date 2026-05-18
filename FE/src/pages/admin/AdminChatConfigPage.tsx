import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, Bot, MessageCircle } from 'lucide-react'
import AdminLayout from '@/components/layout/AdminLayout'
import { chatService } from '@/services/chatService'
import type { ChatConfig, ChatBotRule } from '@/types/chat'

export default function AdminChatConfigPage() {
  const qc = useQueryClient()
  const { data: res, isLoading } = useQuery({
    queryKey: ['chat-config'],
    queryFn: chatService.getConfig,
  })

  const [form, setForm] = useState<ChatConfig>({
    botEnabled: false,
    welcomeMessage: '',
    offlineMessage: '',
    botRules: [],
  })

  useEffect(() => {
    if (res?.data) setForm(res.data)
  }, [res])

  const saveMutation = useMutation({
    mutationFn: () => chatService.updateConfig(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-config'] }),
  })

  function addRule() {
    setForm((f) => ({ ...f, botRules: [...f.botRules, { keyword: '', response: '' }] }))
  }

  function updateRule(i: number, field: keyof ChatBotRule, value: string) {
    setForm((f) => {
      const rules = [...f.botRules]
      rules[i] = { ...rules[i], [field]: value }
      return { ...f, botRules: rules }
    })
  }

  function removeRule(i: number) {
    setForm((f) => ({ ...f, botRules: f.botRules.filter((_, idx) => idx !== i) }))
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (isLoading) return <AdminLayout><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></AdminLayout>

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-6">
        {/* Mode toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            Cấu hình Chatbox
          </h2>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-700 text-sm">Bật chế độ Bot tự động</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Bot sẽ tự trả lời theo từ khóa. Tắt để chỉ hỗ trợ trực tiếp từ admin.
              </p>
            </div>
            <div
              onClick={() => setForm((f) => ({ ...f, botEnabled: !f.botEnabled }))}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0
                ${form.botEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                ${form.botEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </div>
          </label>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Tin nhắn mặc định</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tin nhắn chào</label>
            <textarea value={form.welcomeMessage}
              onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
              rows={2} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tin nhắn ngoài giờ</label>
            <textarea value={form.offlineMessage}
              onChange={(e) => setForm((f) => ({ ...f, offlineMessage: e.target.value }))}
              rows={2} className={inputCls} />
          </div>
        </div>

        {/* Bot rules */}
        {form.botEnabled && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-500" />
                Quy tắc trả lời tự động
              </h2>
              <button onClick={addRule}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                <Plus className="w-4 h-4" /> Thêm quy tắc
              </button>
            </div>
            {form.botRules.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Chưa có quy tắc nào</p>
            )}
            {form.botRules.map((rule, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input value={rule.keyword}
                    onChange={(e) => updateRule(i, 'keyword', e.target.value)}
                    placeholder="Từ khóa (vd: giao hàng)"
                    className={inputCls} />
                  <input value={rule.response}
                    onChange={(e) => updateRule(i, 'response', e.target.value)}
                    placeholder="Câu trả lời tự động"
                    className={inputCls} />
                </div>
                <button onClick={() => removeRule(i)}
                  className="mt-2 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm shadow">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        {saveMutation.isSuccess && (
          <p className="text-green-600 text-sm font-medium">Đã lưu cấu hình thành công!</p>
        )}
      </div>
    </AdminLayout>
  )
}

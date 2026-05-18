import { useQuery, useQueryClient } from '@tanstack/react-query'
import { List, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import { ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { analyticsService, QueryLanguage } from '@/services/analyticsService'

const { Text } = Typography

const LANG_COLOR: Record<QueryLanguage, string> = {
  sql: 'blue',
  python: 'green',
  r: 'purple',
}

interface Props {
  onLoad: (language: QueryLanguage, code: string) => void
}

export default function QueryHistory({ onLoad }: Props) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-history'],
    queryFn: analyticsService.getHistory,
    staleTime: 10_000,
  })

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await analyticsService.deleteHistory(id)
    qc.invalidateQueries({ queryKey: ['analytics-history'] })
  }

  return (
    <div>
      <Text strong style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
        Lịch sử
      </Text>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 8 }} />
      ) : (data?.length ?? 0) === 0 ? (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          Chưa có lịch sử
        </Text>
      ) : (
        <List
          size="small"
          dataSource={data}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}
              onClick={() => onLoad(item.language, item.code)}
              actions={[
                <Tooltip key="del" title="Xóa">
                  <DeleteOutlined
                    style={{ color: '#9ca3af', fontSize: 12 }}
                    onClick={(e) => handleDelete(e, item.id)}
                  />
                </Tooltip>,
              ]}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space size={6}>
                  <Tag color={LANG_COLOR[item.language]} style={{ fontSize: 10, margin: 0 }}>
                    {item.language.toUpperCase()}
                  </Tag>
                  <Tag
                    color={item.status === 'success' ? 'green' : 'red'}
                    style={{ fontSize: 10, margin: 0 }}
                  >
                    {item.status === 'success' ? `${item.rowCount} dòng` : 'lỗi'}
                  </Tag>
                </Space>
                <Text
                  style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace' }}
                  ellipsis
                >
                  {item.code.split('\n')[0]}
                </Text>
                <Space size={4}>
                  <ClockCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} />
                  <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </Text>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}

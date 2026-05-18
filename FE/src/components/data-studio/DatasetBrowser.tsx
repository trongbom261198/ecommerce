import { useQuery } from '@tanstack/react-query'
import { List, Skeleton, Space, Tooltip, Typography } from 'antd'
import { FileOutlined, SyncOutlined } from '@ant-design/icons'
import { analyticsService } from '@/services/analyticsService'

const { Text } = Typography

interface Props {
  onInsert: (snippet: string) => void
}

export default function DatasetBrowser({ onInsert }: Props) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['analytics-datasets'],
    queryFn: analyticsService.listDatasets,
    staleTime: 60_000,
  })

  const handleClick = (minioKey: string) => {
    const snippet = `SELECT *\nFROM read_parquet('s3://analytics-data/${minioKey}')\nLIMIT 100;`
    onInsert(snippet)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
          Datasets
        </Text>
        <Tooltip title="Làm mới danh sách">
          <SyncOutlined
            spin={isFetching}
            style={{ color: '#6b7280', cursor: 'pointer', fontSize: 12 }}
            onClick={() => refetch()}
          />
        </Tooltip>
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (data?.length ?? 0) === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>Chưa có dataset nào</Text>
      ) : (
        <List
          size="small"
          dataSource={data}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '4px 0', borderBottom: 'none' }}
              onClick={() => handleClick(item.minioKey)}
            >
              <Tooltip title={`Click để insert SQL snippet\n${item.minioKey}`} placement="right">
                <Space size={6}>
                  <FileOutlined style={{ color: '#2563eb', fontSize: 12 }} />
                  <Text style={{ fontSize: 12 }} ellipsis>
                    {item.minioKey?.split('/').pop()}
                  </Text>
                </Space>
              </Tooltip>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const API = 'https://provinces.open-api.vn/api'

export interface Province {
  code: number
  name: string
}

export interface Ward {
  code: number
  name: string
}

interface District {
  code: number
  name: string
  wards: Ward[]
}

interface ProvinceDetail extends Province {
  districts: District[]
}

export function useProvinces() {
  return useQuery<Province[]>({
    queryKey: ['provinces'],
    queryFn: () => axios.get<Province[]>(API + '/').then((r) => r.data),
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useWards(provinceCode: number | null) {
  return useQuery<Ward[]>({
    queryKey: ['wards', provinceCode],
    queryFn: () =>
      axios
        .get<ProvinceDetail>(`${API}/p/${provinceCode}?depth=3`)
        .then((r) => r.data.districts.flatMap((d) => d.wards)),
    enabled: provinceCode != null,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

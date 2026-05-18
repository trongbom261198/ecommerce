import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService, type AddToCartRequest } from '@/services/orderService'
import { useCartStore } from '@/store/cartStore'
import { useEffect } from 'react'

export function useCart() {
  const queryClient = useQueryClient()
  const setItemCount = useCartStore((s) => s.setItemCount)

  const {
    data: cartResponse,
    isLoading,
  } = useQuery({
    queryKey: ['cart'],
    queryFn: orderService.getCart,
  })

  useEffect(() => {
    if (cartResponse?.data) {
      setItemCount(cartResponse.data.items?.length ?? 0)
    }
  }, [cartResponse, setItemCount])

  const addItem = useMutation<unknown, Error, AddToCartRequest>({
    mutationFn: orderService.addToCart,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const updateItem = useMutation({
    mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
      orderService.updateCartItem(skuId, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const removeItem = useMutation({
    mutationFn: orderService.removeFromCart,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  return {
    cart: cartResponse?.data,
    isLoading,
    addItem,
    updateItem,
    removeItem,
  }
}

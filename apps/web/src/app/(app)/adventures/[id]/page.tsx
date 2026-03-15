import { AdventureDetail } from './_components/adventure-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdventureDetailPage({ params }: Props) {
  const { id } = await params
  return <AdventureDetail adventureId={id} />
}

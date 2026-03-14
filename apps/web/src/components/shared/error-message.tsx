interface ErrorMessageProps {
  message?: string
}

export function ErrorMessage({
  message = 'An error occurred. Please try again.',
}: ErrorMessageProps) {
  return (
    <div className="text-destructive text-sm p-3 rounded-md bg-destructive/10">
      {message}
    </div>
  )
}

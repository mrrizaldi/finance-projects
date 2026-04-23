export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-content-center bg-background p-4">
      <div className="w-full max-w-md mx-auto">
        {children}
      </div>
    </div>
  );
}

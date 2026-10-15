export function generateStaticParams() {
  return [{ id: '1' }];
}

export default function ClassLayout({ children }) {
  return <>{children}</>;
}

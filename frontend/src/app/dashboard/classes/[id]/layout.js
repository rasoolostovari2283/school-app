export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { id: '1' },
    { id: 'cls-math-101' },
    { id: 'cls-phys-102' },
  ];
}

export default function ClassLayout({ children }) {
  return <>{children}</>;
}

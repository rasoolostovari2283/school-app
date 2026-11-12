export function generateStaticParams() {
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' },
    { id: 'cls-math-101' },
    { id: 'cls-phys-102' },
    { id: 'cls-chem-103' },
    { id: 'cls-bio-104' },
    { id: 'cls-lit-105' },
  ];
}

export default function ClassLayout({ children }) {
  return <>{children}</>;
}

import Link from 'next/link';
import { AuthCard } from '@/components/ui';

export default function NotFound() {
  return (
    <AuthCard title="Sahifa topilmadi">
      <Link href="/" className="text-gold underline">
        Bosh sahifaga qaytish
      </Link>
    </AuthCard>
  );
}

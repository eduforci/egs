import EnseignantNav from '@/components/enseignant-nav';
import ProfilForm from '@/components/profil-form';

export default function ProfilEnseignantPage() {
  return (
    <>
      <div className="p-4 md:px-6 max-w-lg mx-auto pb-0">
        <EnseignantNav />
      </div>
      <ProfilForm />
    </>
  );
}

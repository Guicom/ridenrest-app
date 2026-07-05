import { Redirect } from 'expo-router';

// Point d'entrée `/` (MOB-2.1 / AC4). Délègue au groupe `(app)`, dont le guard
// centralisé (`(app)/_layout`) redirige les utilisateurs non connectés vers
// `(auth)/login`. Remplace l'écran de démo MOB-1.1 (supprimé avec `explore`).
export default function Index() {
  return <Redirect href="/(app)/adventures" />;
}

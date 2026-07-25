import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { EmptyState, ErrorState, Loading } from '../components/States';
import type { Restaurant } from '../types';

export function Restaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRestaurants()
      .then(setRestaurants)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load restaurants'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading label="Loading restaurants…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <header className="page-head">
        <h1>Restaurant favourites</h1>
        <p className="page-head__sub">
          Pick a restaurant to see its menu ranked by community feedback — not raw average score, but a
          Bayesian blend that accounts for sample size.
        </p>
      </header>

      {restaurants.length === 0 && (
        <EmptyState title="No restaurants in the database" hint="Re-seed menusnap.db and try again." />
      )}

      <div className="picker">
        {restaurants.map((restaurant) => (
          <Link key={restaurant.id} className="picker__option" to={`/restaurants/${restaurant.id}`}>
            <span className="picker__name">{restaurant.name}</span>
            <span className="picker__meta">
              {restaurant.cuisine} · {restaurant.menu_item_count ?? 0} dishes
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

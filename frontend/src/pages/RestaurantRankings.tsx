import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { DishCard } from '../components/DishCard';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useUser } from '../state/UserContext';
import type { FeedDish, Restaurant } from '../types';

export function RestaurantRankings() {
  const { id } = useParams();
  const { currentUser } = useUser();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<FeedDish[]>([]);
  const [personalized, setPersonalized] = useState<FeedDish[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const restaurantId = Number(id);
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      setError(`"${id}" is not a valid restaurant id`);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setPersonalized(null);

    api
      .getRestaurantRankings(restaurantId)
      .then((response) => {
        setRestaurant(response.restaurant);
        setDishes(response.dishes);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load rankings'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!currentUser || !restaurant) return;
    api
      .getRecommendations(currentUser.id, restaurant.id)
      .then(setPersonalized)
      .catch(() => setPersonalized(null));
  }, [currentUser, restaurant]);

  if (loading) return <Loading label="Ranking dishes…" />;
  if (error) {
    return (
      <>
        <ErrorState message={error} />
        <Link className="button button--ghost" to="/restaurants">
          Back to restaurants
        </Link>
      </>
    );
  }
  if (!restaurant) return null;

  const personalizedOrder =
    personalized?.map((dish) => dish.menu_item_id).join(',') ?? dishes.map((dish) => dish.menu_item_id).join(',');
  const communityOrder = dishes.map((dish) => dish.menu_item_id).join(',');
  const showPersonalized = Boolean(currentUser && personalized && personalizedOrder !== communityOrder);

  return (
    <section>
      <Link className="detail__back" to="/restaurants">
        ← All restaurants
      </Link>

      <header className="page-head">
        <h1>{restaurant.name}</h1>
        <p className="page-head__sub">
          {restaurant.cuisine}
          {restaurant.address ? ` · ${restaurant.address}` : ''} — {dishes.length} dishes ranked by community
          score.
        </p>
      </header>

      {dishes.length === 0 && (
        <EmptyState title="No available dishes" hint="This restaurant has nothing on the menu right now." />
      )}

      {showPersonalized && personalized && (
        <div className="banner">
          <div>
            <strong>Your order at {restaurant.name} would differ.</strong>
            <p>
              Below is the community ranking. Your personalized order for this restaurant is shown in the second
              list.
            </p>
          </div>
        </div>
      )}

      {dishes.length > 0 && (
        <>
          <h2 className="section-title">Community ranking</h2>
          <p className="tabs__caption">Ranked by Bayesian-smoothed reaction, reorder rate, and review confidence.</p>
          <div className="dish-grid">
            {dishes.map((dish, index) => (
              <div key={dish.menu_item_id} className="ranked-card">
                <span className="ranked-card__rank">#{index + 1}</span>
                <DishCard dish={dish} showDescription />
              </div>
            ))}
          </div>
        </>
      )}

      {showPersonalized && personalized && (
        <>
          <h2 className="section-title">Your recommendations here</h2>
          <p className="tabs__caption">Community score blended with your taste profile, with penalties for dishes you disliked.</p>
          <div className="dish-grid">
            {personalized.map((dish, index) => (
              <div key={dish.menu_item_id} className="ranked-card">
                <span className="ranked-card__rank">#{index + 1}</span>
                <DishCard dish={dish} showDescription />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

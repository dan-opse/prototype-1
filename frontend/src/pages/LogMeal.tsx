import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SOFT_TAG_TARGET, api } from '../api/client';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { formatPrice } from '../components/formatting';
import { useUser } from '../state/UserContext';
import type { DishTag, FeedDish, Restaurant } from '../types';

type Step = 'restaurant' | 'dish' | 'reaction' | 'tags' | 'done';

const REACTION_LABELS = ['Bad', 'Meh', 'Fine', 'Good', 'Great'];

export function LogMeal() {
  const { currentUser, refresh } = useUser();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>('restaurant');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<FeedDish[]>([]);
  const [dish, setDish] = useState<FeedDish | null>(null);
  const [reaction, setReaction] = useState<number | null>(null);
  const [wouldOrderAgain, setWouldOrderAgain] = useState<boolean | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<DishTag[]>([]);
  const [otherTags, setOtherTags] = useState<DishTag[]>([]);
  const [showOtherTags, setShowOtherTags] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRestaurants()
      .then(setRestaurants)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load restaurants'),
      )
      .finally(() => setLoading(false));
  }, []);

  const openRestaurant = useCallback(async (choice: Restaurant) => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.getRestaurantMenu(choice.id);
      setRestaurant(response.restaurant);
      setDishes(response.dishes);
      setStep('dish');
      return response.dishes;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load that menu');
      return [];
    } finally {
      setBusy(false);
    }
  }, []);

  const openDish = useCallback(async (choice: FeedDish) => {
    setBusy(true);
    setError(null);
    try {
      const tags = await api.getDishTags(choice.menu_item_id);
      setDish(choice);
      setSuggestedTags(tags.suggested);
      setOtherTags(tags.other);
      setSelectedTagIds([]);
      setStep('reaction');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load tags for that dish');
    } finally {
      setBusy(false);
    }
  }, []);

  // Deep link from a dish detail page: "Log this meal" jumps straight to the reaction step.
  const prefillRestaurantId = Number(searchParams.get('restaurantId'));
  const prefillDishId = Number(searchParams.get('dishId'));
  useEffect(() => {
    if (!restaurants.length || restaurant || !prefillRestaurantId || !prefillDishId) return;
    const match = restaurants.find((item) => item.id === prefillRestaurantId);
    if (!match) return;
    void openRestaurant(match).then((menu) => {
      const target = menu.find((item) => item.menu_item_id === prefillDishId);
      if (target) void openDish(target);
    });
  }, [restaurants, restaurant, prefillRestaurantId, prefillDishId, openRestaurant, openDish]);

  const groupedDishes = useMemo(() => {
    const groups = new Map<string, FeedDish[]>();
    for (const item of dishes) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()];
  }, [dishes]);

  function toggleTag(tagId: number) {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  }

  async function submit() {
    if (!currentUser || !dish || reaction === null || wouldOrderAgain === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.logMeal({
        userId: currentUser.id,
        menuItemId: dish.menu_item_id,
        reaction,
        wouldOrderAgain,
        tagIds: selectedTagIds,
        note: note.trim() || undefined,
      });
      await refresh();
      setStep('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that meal');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStep('restaurant');
    setRestaurant(null);
    setDishes([]);
    setDish(null);
    setReaction(null);
    setWouldOrderAgain(null);
    setSelectedTagIds([]);
    setSuggestedTags([]);
    setOtherTags([]);
    setShowOtherTags(false);
    setNote('');
  }

  if (!currentUser) {
    return <EmptyState title="Pick a diner first" hint="Choose or create a diner above before logging a meal." />;
  }
  if (loading) return <Loading label="Loading restaurants…" />;

  return (
    <section className="log">
      <header className="page-head">
        <h1>Log a meal</h1>
        <p className="page-head__sub">Where you ate, then what you had. Two taps to rate it, tags to say why.</p>
      </header>

      <ol className="steps">
        {(['restaurant', 'dish', 'reaction', 'tags'] as Step[]).map((name, position) => (
          <li key={name} className={`steps__step ${step === name ? 'is-active' : ''}`}>
            <span className="steps__index">{position + 1}</span>
            <span className="steps__label">
              {name === 'restaurant' && (restaurant?.name ?? 'Restaurant')}
              {name === 'dish' && (dish?.name ?? 'Dish')}
              {name === 'reaction' && 'Reaction'}
              {name === 'tags' && 'Tags'}
            </span>
          </li>
        ))}
      </ol>

      {error && <ErrorState message={error} />}

      {step === 'restaurant' && (
        <div className="picker">
          {restaurants.length === 0 && <EmptyState title="No restaurants in the database" />}
          {restaurants.map((item) => (
            <button
              key={item.id}
              className="picker__option"
              type="button"
              disabled={busy}
              onClick={() => void openRestaurant(item)}
            >
              <span className="picker__name">{item.name}</span>
              <span className="picker__meta">
                {item.cuisine} · {item.menu_item_count ?? 0} dishes
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 'dish' && (
        <>
          <button className="button button--ghost" type="button" onClick={startOver}>
            ← Change restaurant
          </button>
          {groupedDishes.length === 0 && <EmptyState title="This restaurant has no available dishes" />}
          {groupedDishes.map(([category, items]) => (
            <div key={category} className="picker-group">
              <h2 className="picker-group__title">{category}</h2>
              <div className="picker">
                {items.map((item) => (
                  <button
                    key={item.menu_item_id}
                    className="picker__option"
                    type="button"
                    disabled={busy}
                    onClick={() => void openDish(item)}
                  >
                    <span className="picker__name">{item.name}</span>
                    <span className="picker__meta">
                      {formatPrice(item.price_cents)} ·{' '}
                      {item.feedback_count === 0 ? 'no reviews yet' : `${item.feedback_count} reviews`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 'reaction' && dish && (
        <div className="card">
          <h2 className="card__title">
            {dish.name} <span className="muted">at {restaurant?.name}</span>
          </h2>

          <fieldset className="field">
            <legend>How was it?</legend>
            <div className="reaction-row">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`reaction ${reaction === value ? 'is-active' : ''}`}
                  onClick={() => setReaction(value)}
                >
                  <span className="reaction__value">{value}</span>
                  <span className="reaction__label">{REACTION_LABELS[value - 1]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Would you order it again?</legend>
            <div className="toggle-row">
              <button
                type="button"
                className={`button ${wouldOrderAgain === true ? 'button--yes' : 'button--ghost'}`}
                onClick={() => setWouldOrderAgain(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`button ${wouldOrderAgain === false ? 'button--no' : 'button--ghost'}`}
                onClick={() => setWouldOrderAgain(false)}
              >
                No
              </button>
            </div>
          </fieldset>

          <div className="card__actions">
            <button className="button button--ghost" type="button" onClick={() => setStep('dish')}>
              ← Change dish
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={reaction === null || wouldOrderAgain === null}
              onClick={() => setStep('tags')}
            >
              Next: tags
            </button>
          </div>
        </div>
      )}

      {step === 'tags' && dish && (
        <div className="card">
          <h2 className="card__title">What stood out?</h2>
          <p className="muted">
            These are the tags other diners already used on {dish.name}, most common first. Aim for{' '}
            {SOFT_TAG_TARGET} — you can submit with fewer.
          </p>

          {suggestedTags.length === 0 && (
            <p className="muted">No one has tagged this dish yet, so pick from the full list below.</p>
          )}

          <div className="tag-row tag-row--selectable">
            {suggestedTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`tag tag--${tag.kind} ${selectedTagIds.includes(tag.id) ? 'is-selected' : ''}`}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
                {tag.uses > 0 && <span className="tag__count">{tag.uses}</span>}
              </button>
            ))}
          </div>

          <button className="link-button" type="button" onClick={() => setShowOtherTags(!showOtherTags)}>
            {showOtherTags ? 'Hide other tags' : 'Something else?'}
          </button>

          {showOtherTags && (
            <div className="tag-row tag-row--selectable">
              {otherTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag tag--${tag.kind} ${selectedTagIds.includes(tag.id) ? 'is-selected' : ''}`}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          <label className="field">
            <span className="field__label">Note (optional)</span>
            <textarea
              className="input input--textarea"
              rows={3}
              value={note}
              maxLength={500}
              placeholder="Anything you want to remember about this one?"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {selectedTagIds.length > 0 && selectedTagIds.length < SOFT_TAG_TARGET && (
            <p className="nudge">
              {SOFT_TAG_TARGET - selectedTagIds.length} more tag
              {SOFT_TAG_TARGET - selectedTagIds.length === 1 ? '' : 's'} makes your profile sharper, but this is
              enough to submit.
            </p>
          )}

          <div className="card__actions">
            <button className="button button--ghost" type="button" onClick={() => setStep('reaction')}>
              ← Back
            </button>
            <button className="button button--primary" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Saving…' : 'Log this meal'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && dish && (
        <div className="card">
          <h2 className="card__title">Logged {dish.name}</h2>
          <p className="muted">
            Community rankings and your taste profile both just updated — the feed will reflect this immediately.
          </p>
          <div className="card__actions">
            <button className="button button--ghost" type="button" onClick={startOver}>
              Log another meal
            </button>
            <Link className="button button--primary" to="/">
              Back to the feed
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

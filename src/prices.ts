import { Card } from './types';
import { fetchCardsByIds } from './api';

/**
 * Every price refresh in the app goes through this one function.
 *
 * Today it re-reads the cards from the pokemontcg.io catalog (TCGplayer market
 * estimates). To switch to the Poke Wallet API, change ONLY the body of this
 * function: call your Poke Wallet price endpoint for these card ids, then
 * return the cards with `tcgplayer.prices` filled in the same shape
 * ({ holofoil: { market, low, high } }) so every screen keeps working.
 *
 * Keep the API key out of this file. Put it behind a server function so
 * it never ships inside the app.
 */
export async function loadFreshCards(ids: string[]): Promise<Card[]> {
  return fetchCardsByIds(ids);
}

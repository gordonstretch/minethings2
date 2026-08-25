export const CRYPTO_TYPES = Object.freeze([
  { id: 1, mapId: 1, name: 'Aso Coin', symbol: 'ASO', goldPrice: 1, icon: '/node/crypto/aso.svg' },
  { id: 2, mapId: 2, name: 'Bromo Byte', symbol: 'BRO', goldPrice: 2, icon: '/node/crypto/bromo.svg' },
  { id: 3, mapId: 3, name: 'Calbuco Cash', symbol: 'CAL', goldPrice: 4, icon: '/node/crypto/calbuco.svg' },
  { id: 4, mapId: 4, name: 'Dempo Digital', symbol: 'DEM', goldPrice: 8, icon: '/node/crypto/dempo.svg' },
  { id: 5, mapId: 5, name: 'Ebeko Ether', symbol: 'EBE', goldPrice: 16, icon: '/node/crypto/ebeko.svg' },
  { id: 6, mapId: 6, name: 'Fogo Fund', symbol: 'FOG', goldPrice: 32, icon: '/node/crypto/fogo.svg' },
  { id: 7, mapId: 7, name: 'Gallego Goldchain', symbol: 'GAL', goldPrice: 64, icon: '/node/crypto/gallego.svg' }
]);

export function cryptoType(id) {
  return CRYPTO_TYPES.find((entry) => entry.id === Number(id));
}

export function cryptoTypesForMap(mapId) {
  return CRYPTO_TYPES.filter((entry) => entry.mapId <= Number(mapId));
}

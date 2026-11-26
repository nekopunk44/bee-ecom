import photos from '../data/demo-photos.json';

/**
 * Фото демо-товаров со свободными лицензиями из Wikimedia Commons. Лицензии CC BY и
 * CC BY-SA требуют указать автора: подпись стоит под фото товара и на странице
 * «Авторы фото». Когда у товара появятся свои фото, его запись отсюда удаляется.
 */
export type PhotoCredit = {
  title: string;
  page: string;
  image: string;
  author: string;
  license: string;
  licenseUrl: string;
};
export const demoPhotos: Record<string, PhotoCredit[]> = photos;

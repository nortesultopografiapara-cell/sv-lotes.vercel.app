declare module 'shpjs' {
  export default function shp(
    base: ArrayBuffer | ArrayBuffer[],
  ): Promise<import('geojson').FeatureCollection | import('geojson').FeatureCollection[]>;
}

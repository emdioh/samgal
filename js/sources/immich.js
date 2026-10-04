// Photo source interface (extend with a Google Photos source later):
//   listAlbums()        -> [{id, name}]
//   listPhotos(albumId) -> [{id, caption}]   (albumId '' = random selection)
//   loadImage(photo)    -> Promise<objectURL> (caller revokes it)
function ImmichSource(baseUrl, apiKey) {
  var base = baseUrl.replace(/\/+$/, '') + '/api';

  function request(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-api-key': apiKey, Accept: 'application/json' }, opts.headers);
    return fetch(base + path, opts).catch(function () {
      // fetch() only rejects on network/CORS/mixed-content failures, never on HTTP status
      var mixed = location.protocol === 'https:' && base.indexOf('http:') === 0;
      throw new Error('cannot reach ' + base + path + ' from ' + location.origin +
        (mixed ? ' (blocked: https page cannot call http server)' : ' (network or CORS)'));
    }).then(function (r) {
      if (!r.ok) throw new Error('Immich ' + r.status + ' on ' + path);
      return r;
    });
  }

  this.listAlbums = function () {
    return request('/albums').then(function (r) { return r.json(); }).then(function (albums) {
      return albums.map(function (a) { return { id: a.id, name: a.albumName + ' (' + a.assetCount + ')' }; });
    });
  };

  this.listPhotos = function (albumId) {
    function map(assets) {
      return assets
        .filter(function (a) { return a.type === 'IMAGE'; })
        .map(function (a) {
          var d = a.localDateTime || a.fileCreatedAt;
          return { id: a.id, caption: d ? new Date(d).toLocaleDateString() : '' };
        });
    }
    if (albumId) {
      return request('/albums/' + albumId).then(function (r) { return r.json(); })
        .then(function (a) { return map(a.assets); });
    }
    return request('/search/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 200, type: 'IMAGE' })
    }).then(function (r) { return r.json(); }).then(function (res) {
      return map(Array.isArray(res) ? res : (res.assets && res.assets.items) || []);
    });
  };

  // Fetched with the API key header, then served as a blob (<img> can't send headers).
  this.loadImage = function (photo) {
    return request('/assets/' + photo.id + '/thumbnail?size=preview', { headers: { Accept: 'image/*' } })
      .then(function (r) { return r.blob(); })
      .then(function (b) { return URL.createObjectURL(b); });
  };
}

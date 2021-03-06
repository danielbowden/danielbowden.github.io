<script type="text/javascript">
var jekyllMapping = (function () {
    'use strict';
    var settings;
    var obj = {
        plotArray: function(locations) {
            function jekyllMapListen (m, s) {

                if (s.link) {
                    google.maps.event.addListener(m, 'click', function() {
                        window.location.href = s.link;
                    });
                }
            }

            var bounds = new google.maps.LatLngBounds(), markers = [], s, l, m;
            while (locations.length > 0) {
                s = locations.pop();
                l = new google.maps.LatLng(s.latitude, s.longitude);
                m = new google.maps.Marker({
                    position: l,
                    map: this.map,
                    title: s.title
                });
                markers.push(m);
                bounds.extend(l);
                jekyllMapListen(m, s);
            }

            google.maps.event.addListenerOnce(this.map, 'bounds_changed', function(event) {
                if (this.getZoom() > settings.zoom) {
                    this.setZoom(settings.zoom);
                }
            });

            this.map.fitBounds(bounds);
        },
        indexMap: function () {
            this.plotArray(settings);
        },
        pageToMap: function () {
            if (typeof(settings.latitude) !== 'undefined' && typeof(settings.longitude) !== 'undefined') {
                this.options.center = new google.maps.LatLng(settings.latitude, settings.longitude);

                var mainMarker = new google.maps.Marker({
                    position: this.options.center,
                    map: this.map,
                    title: "{{ page.title }}"
                });
                this.map.setCenter(this.options.center);
            }

            if (settings.zoom) {
                this.options.zoom = settings.zoom;
            }

            if (settings.locations instanceof Array) {
                this.plotArray(settings.locations);
            }

            if (settings.kml) {
                var mainLayer = new google.maps.KmlLayer(settings.kml);
                mainLayer.setMap(this.map);
            }

            if (settings.layers) {
                var layers = [];
                while (settings.layers.length > 0){
                    var m = new google.maps.KmlLayer(settings.layers.pop());
                    layers.push(m);
                    m.setMap(this.map);
                }
            }
        },
        mappingInitialize: function () {
            this.options = {
                zoom: settings.zoom? settings.zoom : 10,
                mapTypeId: google.maps.MapTypeId.TERRAIN,
                center: new google.maps.LatLng(0, 0),
                streetViewControl: false,
                mapTypeControl: false,

            };

            this.map = new google.maps.Map(document.getElementById("google-mapping"), this.options);

            if (settings.locations) {
                this.pageToMap();
            } else {
                this.indexMap();
            }
        },
        loadScript: function (set) {
            settings = set;
            var script = document.createElement("script");
            script.type = "text/javascript";
            script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyA-YoSaEBJVaSSxzLDLyycbt24kAttfyhU&sensor=false&callback=jekyllMapping.mappingInitialize";
            document.body.appendChild(script);
        }
    };
    return obj;
}());
</script>

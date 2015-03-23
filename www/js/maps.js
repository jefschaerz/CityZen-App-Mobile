var app = angular.module('cityzen.maps', ['cityzen.settings', 'cityzen.issues', 'angular-storage']);

app.factory('MapService', function (SettingsService, geolocation, $q, $cordovaGeolocation, Loading) {
    return {
        /*
         * Locate the user if he allowed it.
         * If not, load the map center defined in the settings.
         */
        locate: function () {
            Loading.show("Localisation");
            console.log('locating with cordova');
            var dfd = $q.defer();
            var posOptions = {timeout: 10000, enableHighAccuracy: false};
            $cordovaGeolocation
                    .getCurrentPosition(posOptions)
                    .then(function (pos) {
                        var data = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        };
                        dfd.resolve(data);
                        console.log('located !');
                    }, function (error) {
                        console.log(error.message);
                        var data = SettingsService.getMapCenter();
                        dfd.resolve(data);
                        console.log('Default position...');
                    });
            return dfd.promise;
        }
    };
});


// A controller that displays information for the active view's issues
app.controller('MapCtrl', function ($scope, mapboxMapId, mapboxTokenAccess, leafletData, Loading, IssuesService, $q, $rootScope, MapService, $ionicPlatform, $ionicHistory) {
    console.log('MapCtrl loaded');

    // Default user position marker
    function defaultMarker(pos) {
        return {
            lat: pos.lat,
            lng: pos.lng,
            message: "<p>Ma position</p>",
            icon: $scope.pos_icon
        };
    }

    // Disable the swipe menu for this view
    $rootScope.enableLeft = true;

    // Hide the leaflet directive from the template while loading the data
    $scope.showMap = false;
//    $scope.pos_icon = pos_icon;

    // When catching the positionChange event, replace the position marker and if necessary, reload the issues
    $scope.$on('positionChange', function () {
        if ($scope.activeView === 'close') {
            console.log('reloading close issues');
        } else {
            $scope.mapMarkers[0].lat = $scope.settings.mapCenter.lat;
            $scope.mapMarkers[0].lng = $scope.settings.mapCenter.lng;
            $scope.map.fitBounds($scope.mapMarkers);
        }
    });

    // A function that loads the map in the template
    $scope.loadMap = function (pos) {
        Loading.show("Chargement de la carte");
        var dfd = $q.defer();
        // Load the map
        var mapboxTileLayer = "http://api.tiles.mapbox.com/v4/" + mapboxMapId;
        mapboxTileLayer = mapboxTileLayer + "/{z}/{x}/{y}.png?access_token=" + mapboxTokenAccess;
        $scope.mapDefaults = {
            tileLayer: mapboxTileLayer
        };
        // Set the map's center
        $scope.mapCenter = {
            lat: pos.lat,
            lng: pos.lng,
            zoom: Number($scope.settings.zoom)
        };
        $scope.mapMarkers = [defaultMarker(pos)];
        leafletData.getMap('map').then(function (map) {
            $scope.map = map;
            map.attributionControl.setPosition('bottomleft');
            dfd.resolve(pos);
        }, function (error) {
            dfd.reject(error);
        });
        // Show the map on the template
        $scope.showMap = true;
        return dfd.promise;
    };

    // A function that loads the issues' data according to the active view
    $scope.loadData = function (pos) {
        Loading.show("Chargement des données");
        var dfd = $q.defer();
        $scope.error = null;
        IssuesService
                .getViewData($scope.config.activeView, pos)
                .then(function (response) {
                    if (response.data.length === 0) {
                        $scope.error = {msg: "Désolé, aucun résultat..."};
                        dfd.resolve([], pos);
                        console.log('Aucun résultats');
                    } else {
                        $scope.issues = response.data;
                        $scope.init_issues = response.data;
                        dfd.resolve($scope.issues, pos);
                        console.log('Des résultats');
                        console.log(response.data);
                        console.log(response.data.length);
                    }
                }, function (error) {
                    $scope.error = {msg: "Impossible de charger des problèmes."};
                    dfd.reject(error);
                    console.log('ERROR !');
                    console.log(error);
                });
        return dfd.promise;
    };

    $scope.resetMarkers = function (data) {
        var dfd = $q.defer();
        // Reset the mapMarkers array if there is more than just the position marker
        if ($scope.mapMarkers.length > 1) {
            console.log('Des marqueures ! On reset avec que le marqueur de position');
            MapService.locate().then(function (pos) {
                $scope.mapMarkers = [defaultMarker(pos)];
                console.log("Le reset est fait !");
                dfd.resolve(data);
            });
        } else {
            console.log('Pas de marqueurs. On ne touche à rien.');
            dfd.resolve(data);
        }
        return dfd.promise;
    };

    // A function that inserts the issues' data on the map with markers
    $scope.insertData = function (data) {
        Loading.show("Création des marqueurs");
        // If there is any loaded data, create a marker for each one of them and add it to the mapMarkers array
        if (data.length > 0) {
            console.log('Des données ! On les insèrent dans les marqueurs');
            for (var i = 0; i < data.length; i++) {
                var marker = {
                    lat: data[i].lat,
                    lng: data[i].lng,
                    message: "<p ui-sref=\"app.details({issueId:'" + data[i].id + "'})\">" + data[i].description + "</p>"
                };
                $scope.mapMarkers.push(marker);
            }
            console.log("Les données sont transformées en marqueurs");
            // Set the view to encompase all the markers
            $scope.map.fitBounds($scope.mapMarkers);
        } else {
            console.log('Pas de données, rien ne se passe.');
            // Set the view to display only the position marker with the desired zoom
            $scope.map.setView([$scope.mapMarkers[0].lat, $scope.mapMarkers[0].lng], $scope.settings.zoom);
        }
        Loading.hide();
    };

    // A function that handles the error occuring on the chain of function.
    // TODO : use this handle to display onscreen notification with a adequate message
    $scope.handleError = function (error) {
        console.log('Error Handled');
        console.log(error);
        Loading.hide();
    };

    $ionicPlatform.ready(function () {
        console.log('platform ready');
        // When first loading of this controller
        MapService.locate()
                .then($scope.loadMap)
                .then($scope.loadData)
                .then($scope.insertData, $scope.handleError);
    });

    // When catching the viewChange event, reload the issues' data according to the new view
    $scope.$on('viewChange', function () {
        console.log('Oh ! The view has changed to ' + $scope.config.activeView);
        MapService.locate().then($scope.loadData).then($scope.resetMarkers).then($scope.insertData, $scope.handleError);
    });
    
    // Update the data when a config changes
    $scope.$on('issueTypeChange', function () {
        $scope.error = null;
        $scope.issues = IssuesService.filterIssueState($scope.init_issues, $scope.settings.stateFilters);
        $scope.issues = IssuesService.filterIssueType($scope.issues, $scope.config.issueTypes);
        if ($scope.issues.length === 0) {
            $scope.error = {msg: "Désolé, aucun résultat..."};
        }
        $scope.resetMarkers($scope.issues).then($scope.insertData, $scope.handleError);
    });
    // Update the data when a config changes
    $scope.$on('issueStateChange', function () {
        $scope.error = null;
        $scope.issues = IssuesService.filterIssueType($scope.init_issues, $scope.config.issueTypes);
        $scope.issues = IssuesService.filterIssueState($scope.issues, $scope.settings.stateFilters);
        if ($scope.issues.length === 0) {
            $scope.error = {msg: "Désolé, aucun résultat..."};
        }
        $scope.resetMarkers($scope.issues).then($scope.insertData, $scope.handleError);
    });

    $scope.$on('$ionicView.enter', function (event, data) {
        console.log($ionicHistory.viewHistory());
    });

});

// Controller that show a particular issue on its own map
app.controller('DetailsMapCtrl', function ($rootScope, store, $scope, mapboxMapId, mapboxTokenAccess, leafletData, $stateParams) {

    // Disable the swipe menu for this screen
    $rootScope.enableLeft = false;

    // Get the issue's data from the storage
    var issue = store.get('issue');

    // Load the map
    var mapboxTileLayer = "http://api.tiles.mapbox.com/v4/" + mapboxMapId;
    mapboxTileLayer = mapboxTileLayer + "/{z}/{x}/{y}.png?access_token=" + mapboxTokenAccess;
    $scope.mapDefaults = {
        tileLayer: mapboxTileLayer
    };

    // Set the map's center to the issue's location
    $scope.mapCenter = {
        lat: issue.lat,
        lng: issue.lng,
        zoom: Number($scope.settings.zoom)
    };

    // Create a marker with the issue's information
    $scope.mapMarkers = [{
            lat: issue.lat,
            lng: issue.lng,
            message: "<p>" + issue.description + "</p>",
        }
    ];
    leafletData.getMap('map-details').then(function (map) {
        map.attributionControl.setPosition('bottomleft');
    });
});
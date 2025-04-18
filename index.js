let map, infoWindow, chart;
let riverData = []; // Ensure this is not a constant
let markers = [];
let dataTable; // For the DataTable instance
let searchMarker = null; // For tracking the temporary search marker

function initMap() {
  infoWindow = new google.maps.InfoWindow();
  getCurrentPosition()
    .then((pos) => {
      // Define custom light mode styles
      const lightModeStyles = [
        {
          elementType: "geometry",
          stylers: [{ color: "#f5f5f5" }],
        },
        {
          elementType: "labels.icon",
          stylers: [{ visibility: "off" }],
        },
        {
          elementType: "labels.text.fill",
          stylers: [{ color: "#616161" }],
        },
        {
          elementType: "labels.text.stroke",
          stylers: [{ color: "#f5f5f5" }],
        },
        {
          featureType: "administrative.land_parcel",
          elementType: "labels.text.fill",
          stylers: [{ color: "#bdbdbd" }],
        },
        {
          featureType: "poi",
          elementType: "geometry",
          stylers: [{ color: "#eeeeee" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#757575" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#ffffff" }],
        },
        {
          featureType: "road.arterial",
          elementType: "labels.text.fill",
          stylers: [{ color: "#757575" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#dadada" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#616161" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#c9c9c9" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9e9e9e" }],
        },
      ];

      // Initialize the map
      map = new google.maps.Map(document.getElementById("map"), {
        center: pos,
        zoom: 12,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        scaleControl: true,
        streetViewControl: true,
        rotateControl: false,
        fullscreenControl: true,
        mapTypeId: google.maps.MapTypeId.SATELLITE, // Default to Satellite view
        styles: lightModeStyles, // Apply light mode styles
      });

      const input = document.getElementById("pac-input");
      const searchBox = new google.maps.places.SearchBox(input);
      searchBox.addListener("places_changed", function () {
        const places = searchBox.getPlaces();
        if (places.length === 0) {
          return;
        }
        places.forEach((place) => {
          if (!place.geometry) {
            console.log("Returned place contains no geometry");
            return;
          }
          const placeLat = place.geometry.location.lat();
          const placeLng = place.geometry.location.lng();

          // Don't create a marker for search locations, just center the map
          map.setCenter(place.geometry.location);
          sendGeolocation(placeLat, placeLng);
        });
      });

      // Add click listener to map
      map.addListener("click", (e) => mapClickListener(e.latLng));

      // Fetch initial river data on map load
      google.maps.event.addListenerOnce(map, "idle", function () {
        setLocationAndFetchData(pos.lat, pos.lng);
      });

      console.log("Map initialized with light mode and satellite view!");
    })
    .catch((error) => console.error("Error initializing map: ", error));
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          resolve({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.error("Error getting geolocation: ", error);
          // Default to a central US location if geolocation fails
          resolve({ lat: 39.8283, lng: -98.5795 });
        }
      );
    } else {
      console.log("Geolocation is not supported by this browser.");
      // Default to a central US location if geolocation is not supported
      resolve({ lat: 39.8283, lng: -98.5795 });
    }
  });
}

function mapClickListener(latlng) {
  const latitude = latlng.lat().toFixed(6);
  const longitude = latlng.lng().toFixed(6);
  const infoWindowContent = `
      <div style="color: #212529;">
        <div style="margin-bottom: 10px;">
          <strong>Location:</strong> ${latitude}, ${longitude}
        </div>
        <button class="btn btn-sm" style="background-color: #3c7fb1; color: white;" onclick="window.sendGeolocation(${latitude}, ${longitude})">
          Fetch River Data
        </button>
      </div>
    `;

  infoWindow.setContent(infoWindowContent);
  infoWindow.setPosition(latlng);
  infoWindow.open(map);
}

window.sendGeolocation = (lat, lon) => {
  infoWindow.close();
  map.setCenter(new google.maps.LatLng(lat, lon));
  console.log("Fetching data for location: ", lat, lon);
  setLocationAndFetchData(lat, lon);
};

async function fetchRiverUpdate(location) {
  const locationCoordinates = location.split(",");
  const radius = 0.5;

  const wlong = (Number(locationCoordinates[1]) - radius).toFixed(6);
  const slat = (Number(locationCoordinates[0]) - radius).toFixed(6);
  const elong = (Number(locationCoordinates[1]) + radius).toFixed(6);
  const nlat = (Number(locationCoordinates[0]) + radius).toFixed(6);

  try {
    // USGS API doesn't require authentication and works with CORS
    const response = await fetch(
      `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${wlong},${slat},${elong},${nlat}&parameterCd=00060,00065&siteType=ST&siteStatus=all`
    );
    const riverData = await response.json();

    const processedData = processRiverData(riverData);

    return processedData;
  } catch (error) {
    console.error(`[fetchRiverUpdate Error]: ${error}`);
    return {}; // Return an empty object or some error indication as needed
  }
}

function processRiverData(riverData) {
  // Handle empty or invalid responses
  if (!riverData || !riverData.value || !riverData.value.timeSeries) {
    console.error("Invalid river data format received");
    return [];
  }

  const values = riverData.value.timeSeries;
  const riverInfo = [];

  values.forEach((value) => {
    const { variable, sourceInfo, values } = value;
    const { siteName, geoLocation } = sourceInfo;
    const { latitude, longitude } = geoLocation.geogLocation;
    const { variableName } = variable;

    values[0].value.forEach((entry) => {
      const { dateTime, value } = entry;
      const riverEntry = { dateTime, variableName, value };

      const siteEntry = riverInfo.find((entry) => entry.siteName === siteName);
      if (siteEntry) {
        siteEntry.entries.push(riverEntry);
      } else {
        riverInfo.push({
          siteName,
          latitude,
          longitude,
          entries: [riverEntry],
        });
      }
    });
  });

  const flattenedRiverInfo = riverInfo.map(
    ({ siteName, latitude, longitude, entries }) => {
      const flattenedEntries = entries.reduce((acc, curr) => {
        const key = curr.variableName
          .split(",")[0]
          .toLowerCase()
          .replace(/ /g, "");
        acc[key] = curr.value;
        return acc;
      }, {});
      return {
        siteName,
        latitude,
        longitude,
        dateTime: formatDateTime(entries[0].dateTime),
        ...flattenedEntries,
      };
    }
  );

  return flattenedRiverInfo.filter(
    (value) => value.streamflow > 0 && value.gageheight !== undefined
  );
}

function formatDateTime(dateTimeStr) {
  const date = new Date(dateTimeStr);
  return date.toLocaleString();
}

// Categorize flow and height values for visual indicators
function getFlowCategory(flow) {
  if (flow > 5000) return "flow-high";
  if (flow > 1000) return "flow-medium";
  return "flow-low";
}

function getHeightCategory(height) {
  if (height > 10) return "height-high";
  if (height > 5) return "height-medium";
  return "height-low";
}

async function setLocationAndFetchData(lat, lon) {
  const data = { latitude: lat, longitude: lon };
  console.log(`Setting location to: ${data.latitude}, ${data.longitude}`);
  const radius = 0.5;

  // Clear all markers when fetching new data
  clearAllMarkers();
  
  // Directly use data.latitude and data.longitude
  const wlong = (Number(data.longitude) - radius).toFixed(6);
  const slat = (Number(data.latitude) - radius).toFixed(6);
  const elong = (Number(data.longitude) + radius).toFixed(6);
  const nlat = (Number(data.latitude) + radius).toFixed(6);

  // Add a loading indicator
  document.getElementById("river-data-table").innerHTML = `
    <div class="d-flex justify-content-center p-5">
      <div class="spinner-border" style="color: #888;" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;

  try {
    const response = await fetch(
      `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${wlong},${slat},${elong},${nlat}&parameterCd=00060,00065&siteType=ST&siteStatus=all`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const riverDataResponse = await response.json();
    const flattenedRiverInfo = processRiverData(riverDataResponse);
    
    if (flattenedRiverInfo.length === 0) {
      showNoDataMessage();
    } else {
      riverData = flattenedRiverInfo; // Reassign riverData to the processed data
      displayRiverDataMarkers(flattenedRiverInfo);
      displayRiverDataTable(flattenedRiverInfo);
      
      // Update the data count badge
      document.getElementById("data-count").textContent = flattenedRiverInfo.length;
      
      console.log(`Found ${flattenedRiverInfo.length} river data points`);
    }
  } catch (error) {
    console.error(`[ERROR]: ${error}`);
    showErrorMessage(error);
  }
}

// Function to clear all markers from the map
function clearAllMarkers() {
  // Clear river data markers
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}

function showNoDataMessage() {
  const tableContainer = document.getElementById("river-data-table");
  tableContainer.innerHTML = `
    <div class="alert m-3" style="background-color: #333; color: #ffffff; border-color: #3c7fb1;">
      No river data found for this location. Try another area with rivers or streams.
    </div>
  `;
  
  // Update the data count badge
  document.getElementById("data-count").textContent = "0";
}

function showErrorMessage(error) {
  const tableContainer = document.getElementById("river-data-table");
  tableContainer.innerHTML = `
    <div class="alert m-3" style="background-color: #333; color: #ffffff; border-color: #3c7fb1;">
      Error fetching river data: ${error.message || 'Unknown error'}
    </div>
  `;
  
  // Update the data count badge
  document.getElementById("data-count").textContent = "0";
}

function displayRiverDataMarkers(riverData) {
  console.log("Displaying river data markers:", riverData);
  markers.forEach((marker) => marker.setMap(null)); // Remove previous markers
  markers = []; // Clear the markers array

  // Use blue markers for better visibility
  riverData.forEach((river) => {
    console.log("Creating marker for:", river.siteName);
    
    const marker = new google.maps.Marker({
      position: {
        lat: parseFloat(river.latitude),
        lng: parseFloat(river.longitude),
      },
      map: map,
      title: river.siteName,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#3c7fb1", // Blue for better visibility
        fillOpacity: 0.9,
        strokeWeight: 2,
        strokeColor: "#FFFFFF",
      },
    });

    marker.addListener("click", () => {
      const contentString = `
        <div style="color: #212529; max-width: 300px;">
          <h5 style="color: #3c7fb1; font-weight: bold;">${river.siteName}</h5>
          <p><strong>Date/Time:</strong> ${river.dateTime}</p>
          <p><strong>Location:</strong> ${river.latitude}, ${river.longitude}</p>
          <p>
            <strong>Streamflow:</strong> <span style="font-weight: bold;">${river.streamflow} cfs</span><br>
            <strong>Gage Height:</strong> <span style="font-weight: bold;">${river.gageheight} ft</span>
          </p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${river.latitude},${river.longitude}" target="_blank" style="color: #0d6efd; text-decoration: none; font-weight: bold;">Get Directions</a>
        </div>
      `;
      infoWindow.setContent(contentString);
      infoWindow.open(map, marker);
    });

    markers.push(marker);
  });
}

function displayRiverDataTable(riverData) {
  const tableContainer = document.getElementById("river-data-table");
  
  // Destroy existing DataTable if it exists
  if (dataTable) {
    dataTable.destroy();
  }
  
  // Create table HTML
  let tableHTML = `
    <table id="river-table" class="table table-dark table-hover table-striped">
      <thead>
        <tr>
          <th>Site Name</th>
          <th>Date/Time</th>
          <th>Streamflow (cfs)</th>
          <th>Gage Height (ft)</th>
        </tr>
      </thead>
      <tbody>
  `;

  riverData.forEach((river, index) => {
    tableHTML += `
      <tr onclick="centerMapOnLocation(${river.latitude}, ${river.longitude}, ${index})">
        <td>${river.siteName}</td>
        <td>${river.dateTime}</td>
        <td class="text-end measure-value">${river.streamflow}</td>
        <td class="text-end measure-value">${river.gageheight}</td>
      </tr>
    `;
  });

  tableHTML += `
      </tbody>
    </table>
  `;
  
  tableContainer.innerHTML = tableHTML;
  
  // Initialize DataTable with 100 entries by default
  dataTable = $('#river-table').DataTable({
    responsive: true,
    order: [[2, 'desc']], // Sort by streamflow by default
    pageLength: 100, // Show 100 entries by default
    lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]], // Include 100 in the length menu
    language: {
      search: "_INPUT_",
      searchPlaceholder: "Search rivers...",
      info: "Showing _START_ to _END_ of _TOTAL_ rivers",
      lengthMenu: "Show _MENU_ rivers"
    },
    dom: '<"top"fl>rt<"bottom"ip>',
    initComplete: function() {
      // Add custom styling to DataTable elements
      $('.dataTables_filter input').addClass('form-control form-control-sm bg-dark border-secondary text-light');
      $('.dataTables_length select').addClass('form-select form-select-sm bg-dark border-secondary text-light');
    }
  });
}

window.centerMapOnLocation = (lat, lng, index) => {
  const location = new google.maps.LatLng(lat, lng);
  map.setCenter(location);
  map.setZoom(14); // Zoom in when clicking on a table row
  google.maps.event.trigger(markers[index], "click"); // Show info window for the marker
};

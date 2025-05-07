let genderChartInstance = null;
let ageChartInstance = null;
let allPatients = [];

function initializeVisualizations() {
  // Register Chart.js zoom plugin
  if (typeof Chart !== 'undefined' && typeof chartjsPluginZoom !== 'undefined') {
    Chart.register(chartjsPluginZoom);
    console.log('Chart.js zoom plugin registered');
  } else {
    console.error('Chart.js or zoom plugin not loaded');
    Swal.fire({
      icon: 'error',
      title: 'Visualization Error',
      text: 'Failed to load Chart.js or zoom plugin',
      confirmButtonColor: '#4154f1'
    });
  }

  // Fetch patient data for gender and age visualizations
  fetchPatientsData();
}

async function fetchPatientsData() {
  try {
    const response = await fetch('https://balane-saspa-dental-1.onrender.com/api/patients/allPatients', {
      credentials: 'include',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
        'CSRF-Token': await getCsrfToken()
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    allPatients = data;
    console.log('Patients data loaded:', allPatients);

    // Render gender and age charts if canvases exist
    const genderCanvas = document.getElementById('genderChart');
    const ageCanvas = document.getElementById('ageChart');
    if (genderCanvas && ageCanvas) {
      renderGenderChart();
      renderAgeChart();
    } else {
      console.warn('Gender or Age chart canvas not found');
    }
  } catch (error) {
    console.error('Error fetching patients data:', error);
    Swal.fire({
      icon: 'error',
      title: 'Data Error',
      text: `Failed to load patient data: ${error.message}`,
      confirmButtonColor: '#4154f1'
    });
  }
}

async function getCsrfToken() {
  try {
    const response = await fetch('https://balane-saspa-dental-1.onrender.com/auth/csrf-token', {
      credentials: 'include'
    });
    const data = await response.json();
    return data.csrfToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    throw new Error('Failed to fetch CSRF token');
  }
}

function renderGenderChart() {
  const genderCanvas = document.getElementById('genderChart');
  if (!genderCanvas) {
    console.error('Gender chart canvas not found');
    return;
  }

  const ctx = genderCanvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context for gender chart');
    return;
  }

  // Aggregate gender data
  const genderCounts = {
    Male: 0,
    Female: 0,
    Unknown: 0
  };

  allPatients.forEach(patient => {
    const gender = patient.sex || 'Unknown';
    if (gender in genderCounts) {
      genderCounts[gender]++;
    } else {
      genderCounts.Unknown++;
    }
  });

  const data = {
    labels: Object.keys(genderCounts),
    datasets: [{
      data: Object.values(genderCounts),
      backgroundColor: ['#36A2EB', '#FF6384', '#CCCCCC'],
      borderColor: ['#2E8BC0', '#D81B60', '#999999'],
      borderWidth: 1
    }]
  };

  if (genderChartInstance) {
    genderChartInstance.destroy();
  }

  genderChartInstance = new Chart(ctx, {
    type: 'pie',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 12, family: 'Nunito' },
            color: '#333'
          }
        },
        title: {
          display: true,
          text: 'Gender Distribution',
          font: { size: 16, weight: '600', family: 'Nunito' },
          color: '#333',
          padding: { top: 10, bottom: 10 }
        },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#333',
          bodyColor: '#666',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'xy'
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
  console.log('Gender chart rendered');
}

function renderAgeChart() {
  const ageCanvas = document.getElementById('ageChart');
  if (!ageCanvas) {
    console.error('Age chart canvas not found');
    return;
  }

  const ctx = ageCanvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context for age chart');
    return;
  }

  // Define age groups
  const ageGroups = {
    '0-18': 0,
    '19-30': 0,
    '31-45': 0,
    '46-60': 0,
    '61+': 0,
    'Unknown': 0
  };

  allPatients.forEach(patient => {
    const age = patient.age;
    if (age === 0 || isNaN(age)) {
      ageGroups.Unknown++;
    } else if (age <= 18) {
      ageGroups['0-18']++;
    } else if (age <= 30) {
      ageGroups['19-30']++;
    } else if (age <= 45) {
      ageGroups['31-45']++;
    } else if (age <= 60) {
      ageGroups['46-60']++;
    } else {
      ageGroups['61+']++;
    }
  });

  const data = {
    labels: Object.keys(ageGroups),
    datasets: [{
      label: 'Number of Patients',
      data: Object.values(ageGroups),
      backgroundColor: '#36A2EB',
      borderColor: '#2E8BC0',
      borderWidth: 1
    }]
  };

  if (ageChartInstance) {
    ageChartInstance.destroy();
  }

  ageChartInstance = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Patients',
            font: { size: 14, weight: '600', family: 'Nunito' },
            color: '#333'
          },
          ticks: {
            stepSize: 1,
            font: { size: 12, family: 'Nunito' },
            color: '#666'
          },
          grid: {
            color: '#e0e0e0',
            borderDash: [5, 5]
          }
        },
        x: {
          title: {
            display: true,
            text: 'Age Group',
            font: { size: 14, weight: '600', family: 'Nunito' },
            color: '#333'
          },
          ticks: {
            font: { size: 12, family: 'Nunito' },
            color: '#666'
          },
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          text: 'Age Group Distribution',
          font: { size: 16, weight: '600', family: 'Nunito' },
          color: '#333',
          padding: { top: 10, bottom: 10 }
        },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#333',
          bodyColor: '#666',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'xy'
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
  console.log('Age chart rendered');
}

function renderAppointmentsGraph(appointments, services, year, selectedService) {
  try {
    const canvas = document.getElementById('appointmentsChart');
    if (!canvas) {
      throw new Error('Canvas element #appointmentsChart not found');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for canvas');
    }

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const serviceData = {};
    services.forEach((service, index) => {
      serviceData[service.name] = {
        counts: Array(12).fill(0),
        color: generateColor(index)
      };
    });

    console.log('Processing appointments:', appointments.length);
    appointments.forEach(app => {
      const date = new Date(app.appointment_date);
      if (isNaN(date.getTime())) return;
      const monthIndex = date.getMonth();
      const appYear = date.getFullYear();
      const serviceName = app.services?.name || 'Unknown';
      if (appYear === year && serviceData[serviceName]) {
        serviceData[serviceName].counts[monthIndex]++;
      }
    });
    console.log('Service data:', serviceData);

    const datasets = Object.keys(serviceData).map(service => {
      const data = serviceData[service].counts;
      const hasAppointments = data.reduce((sum, value) => sum + value, 0) > 0;
      const color = hasAppointments ? serviceData[service].color : '#6b7280';
      return {
        label: service,
        data: data,
        borderColor: color,
        backgroundColor: `${color}40`,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        hidden: selectedService !== 'all' && service !== selectedService
      };
    });
    console.log('Datasets:', datasets);

    let monthlyTotals;
    if (selectedService === 'all') {
      monthlyTotals = Array(12).fill(0);
      datasets.forEach(dataset => {
        dataset.data.forEach((count, i) => {
          monthlyTotals[i] += count;
        });
      });
    } else {
      monthlyTotals = serviceData[selectedService]?.counts || Array(12).fill(0);
    }

    const maxCount = Math.max(...monthlyTotals);
    const highestMonthIndex = monthlyTotals.indexOf(maxCount);
    const highestMonth = months[highestMonthIndex];

    if (window.chartInstance) {
      window.chartInstance.destroy();
    }

    window.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Appointments',
              font: { size: 14, weight: '600', family: 'Nunito' },
              color: '#333'
            },
            ticks: {
              stepSize: 1,
              font: { size: 12, family: 'Nunito' },
              color: '#666'
            },
            grid: {
              color: '#e0e0e0',
              borderDash: [5, 5]
            }
          },
          x: {
            title: {
              display: true,
              text: `Month (${year})`,
              font: { size: 14, weight: '600', family: 'Nunito' },
              color: '#333'
            },
            ticks: {
              font: { size: 12, family: 'Nunito' },
              color: '#666'
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: `Appointments by Month and Service (${year})`,
            font: { size: 18, weight: '600', family: 'Nunito' },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#333',
            bodyColor: '#666',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            titleFont: { size: 14, weight: '600', family: 'Nunito' },
            bodyFont: { size: 12, family: 'Nunito' }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'xy'
            },
            zoom: {
              wheel: {
                enabled: true
              },
              pinch: {
                enabled: true
              },
              mode: 'xy'
            }
          }
        },
        animation: {
          duration: 1000,
          easing: 'easeOutQuart'
        }
      }
    });
    console.log('Appointments chart rendered:', window.chartInstance);

    const legendContainer = document.getElementById('chartLegend');
    legendContainer.innerHTML = '';
    datasets.forEach((dataset) => {
      const legendItem = document.createElement('div');
      legendItem.className = `legend-item ${dataset.hidden ? 'hidden' : ''}`;
      legendItem.innerHTML = `
        <span class="legend-color" style="background-color: ${dataset.borderColor};"></span>
        <span>${dataset.label}</span>
      `;
      legendItem.addEventListener('click', () => {
        dataset.hidden = !dataset.hidden;
        legendItem.classList.toggle('hidden');
        window.chartInstance.update();
      });
      legendContainer.appendChild(legendItem);
    });

    document.getElementById('pageTitle').textContent = `Monthly Appointments Overview (${year})`;
    document.getElementById('highestMonthText').textContent = 
      selectedService === 'all' 
        ? `Month with Highest Total Appointments: ${highestMonth} (${maxCount} appointments)`
        : `Month with Highest Appointments for ${selectedService}: ${highestMonth} (${maxCount} appointments)`;
  } catch (error) {
    console.error('Error rendering appointments graph:', error);
    Swal.fire({
      icon: 'error',
      title: 'Graph Error',
      text: `Failed to render appointments graph: ${error.message}`,
      confirmButtonColor: '#4154f1'
    });
    document.getElementById('highestMonthText').textContent = 'Failed to render appointments graph.';
  }
}

function generateColor(index) {
  const colors = [
    '#2563eb', '#f97316', '#dc2626', '#14b8a6', '#9333ea', '#f59e0b', '#16a34a',
    '#db2777', '#eab308', '#3b82f6', '#4f46e5', '#a3e635', '#22c55e', '#ea580c',
    '#7c3aed', '#06b6d4', '#ec4899', '#ef4444', '#65a30d', '#0ea5e9'
  ];
  return colors[index % colors.length];
}
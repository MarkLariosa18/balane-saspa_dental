/* visualizations.js - Enhanced interactive visualizations for appointments dashboard */
console.log('Visualizations.js loaded');

let lineChartInstance = null;
let genderPieChartInstance = null;
let ageBarChartInstance = null;

function initializeVisualizations() {
    // Load additional Chart.js plugins
    if (!Chart.plugins.getPlugin('zoom')) {
        Chart.register(ChartZoom);
    }
}

function calculateAge(birthDate) {
    if (!birthDate || isNaN(new Date(birthDate).getTime())) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function getAgeGroup(age) {
    if (age === null) return 'Unknown';
    if (age < 18) return '0-17';
    if (age < 30) return '18-29';
    if (age < 40) return '30-39';
    if (age < 50) return '40-49';
    if (age < 60) return '50-59';
    return '60+';
}

function generateColor(index) {
    const colors = [
        '#2563eb', '#f97316', '#dc2626', '#14b8a6', '#9333ea', '#f59e0b', '#16a34a',
        '#db2777', '#eab308', '#3b82f6', '#4f46e5', '#a3e635', '#22c55e', '#ea580c',
        '#7c3aed', '#06b6d4', '#ec4899', '#ef4444', '#65a30d', '#0ea5e9'
    ];
    return colors[index % colors.length];
}

function renderAppointmentsGraph(appointments, services, year, selectedService) {
    try {
        // Line Chart: Monthly Appointments by Service
        const lineCanvas = document.getElementById('appointmentsChart');
        if (!lineCanvas) throw new Error('Canvas element #appointmentsChart not found');
        const lineCtx = lineCanvas.getContext('2d');
        if (!lineCtx) throw new Error('Failed to get 2D context for line chart canvas');

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

        if (lineChartInstance) {
            lineChartInstance.destroy();
        }

        lineChartInstance = new Chart(lineCtx, {
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
                        bodyFont: { size: 12, family: 'Nunito' },
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y + ' appointments';
                                }
                                return label;
                            }
                        }
                    },
                    zoom: {
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                interaction: {
                    mode: 'nearest',
                    intersect: false,
                    axis: 'x'
                }
            }
        });

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
                lineChartInstance.update();
            });
            legendContainer.appendChild(legendItem);
        });

        document.getElementById('pageTitle').textContent = `Monthly Appointments Overview (${year})`;
        document.getElementById('highestMonthText').textContent = 
            selectedService === 'all' 
                ? `Month with Highest Total Appointments: ${highestMonth} (${maxCount} appointments)`
                : `Month with Highest Appointments for ${selectedService}: ${highestMonth} (${maxCount} appointments)`;

        // Pie Chart: Gender Distribution
        const genderCanvas = document.getElementById('genderChart');
        if (!genderCanvas) throw new Error('Canvas element #genderChart not found');
        const genderCtx = genderCanvas.getContext('2d');
        if (!genderCtx) throw new Error('Failed to get 2D context for gender chart canvas');

        const genderCounts = { Male: 0, Female: 0, Other: 0, Unknown: 0 };
        appointments.forEach(app => {
            const gender = app.patients?.gender?.toLowerCase() || 'unknown';
            const year = new Date(app.appointment_date).getFullYear();
            if (year === year) {
                if (gender === 'male') genderCounts.Male++;
                else if (gender === 'female') genderCounts.Female++;
                else if (gender === 'other') genderCounts.Other++;
                else genderCounts.Unknown++;
            }
        });

        const genderData = {
            labels: Object.keys(genderCounts),
            datasets: [{
                data: Object.values(genderCounts),
                backgroundColor: ['#2563eb', '#f97316', '#dc2626', '#6b7280'],
                borderColor: '#fff',
                borderWidth: 2
            }]
        };

        if (genderPieChartInstance) {
            genderPieChartInstance.destroy();
        }

        genderPieChartInstance = new Chart(genderCtx, {
            type: 'pie',
            data: genderData,
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
                        text: `Appointment Gender Distribution (${year})`,
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
                        bodyFont: { size: 12, family: 'Nunito' },
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} appointments (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        // Bar Chart: Age Group Distribution
        const ageCanvas = document.getElementById('ageChart');
        if (!ageCanvas) throw new Error('Canvas element #ageChart not found');
        const ageCtx = ageCanvas.getContext('2d');
        if (!ageCtx) throw new Error('Failed to get 2D context for age chart canvas');

        const ageGroups = ['0-17', '18-29', '30-39', '40-49', '50-59', '60+', 'Unknown'];
        const ageCounts = ageGroups.reduce((acc, group) => ({ ...acc, [group]: 0 }), {});
        appointments.forEach(app => {
            const year = new Date(app.appointment_date).getFullYear();
            if (year === year) {
                const age = calculateAge(app.patients?.birth_date);
                const ageGroup = getAgeGroup(age);
                ageCounts[ageGroup]++;
            }
        });

        const ageData = {
            labels: ageGroups,
            datasets: [{
                label: 'Appointments',
                data: ageGroups.map(group => ageCounts[group]),
                backgroundColor: ageGroups.map((_, index) => generateColor(index)),
                borderColor: ageGroups.map((_, index) => generateColor(index)),
                borderWidth: 1
            }]
        };

        if (ageBarChartInstance) {
            ageBarChartInstance.destroy();
        }

        ageBarChartInstance = new Chart(ageCtx, {
            type: 'bar',
            data: ageData,
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
                            text: 'Age Groups',
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
                        text: `Appointment Age Group Distribution (${year})`,
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
                        bodyFont: { size: 12, family: 'Nunito' },
                        callbacks: {
                            label: function(context) {
                                const value = context.raw || 0;
                                return `Appointments: ${value}`;
                            }
                        }
                    },
                    zoom: {
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

    } catch (error) {
        console.error('Error rendering visualizations:', error);
        Swal.fire({
            icon: 'error',
            title: 'Visualization Error',
            text: `Failed to render visualizations: ${error.message}`,
            confirmButtonColor: '#4154f1'
        });
    }
}
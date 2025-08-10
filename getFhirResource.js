const logging = require('./logging')
const dotenv = require('dotenv');
dotenv.config();

const { getCachedToken } = require('./keycloakAuth')

const getFhirResource = async (
    method, 
    fhirResource, 
    resourceId, 
    query, 
    bodyContent
) => {

    try {

        const accessToken = await getCachedToken();

        const headers = {
            Authorization: `Bearer ${accessToken}`,
        };

        if (method === 'PATCH') {
            headers['Content-Type'] = 'application/json-patch+json';
        } else if (method === 'POST' || method === 'PUT') {
            headers['Content-Type'] = 'application/fhir+json';
        }

        const buildUrl = (url) => {
            if (url) return url; // use full URL for pagination link (usually absolute)
            return (
                process.env.HAPI_BASE_URL +
                `/${fhirResource}` +
                (resourceId ? `/${resourceId}` : '') +
                (query ? `?${query}` : '')
            );
        };

        // For PATCH method
        if (method === 'PATCH') {

            const url = buildUrl();

            logging('Info', `Patching resource. URL: ${url}`);

            const response = await fetch(url, {
                method: 'PATCH',
                headers,
                body: bodyContent
            });

            const jsonResponse = await response.json();

            if (response.ok && jsonResponse) {
                logging('Info', `Successfully patched resource: ${fhirResource}, ID: ${resourceId}`);
                return { response: jsonResponse, status: true };
            } else {
                logging('Error', `Failed to patch resource: ${resourceId} Status: ${response.status}`);
                return { status: false };
            }

        }

        // For GET method with pagination support
        if(method == "GET") {
            let url = buildUrl();

            logging('Info', `Starting GET request: ${url}`);

            let allEntries = [];
            let total = 0;

            while (url) {
                logging('Info', `Fetching: ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    headers
                });

                if (!response.ok) {
                    logging('Error', `GET request failed with status ${response.status} for URL: ${url}`);
                    return { status: false };
                }

                const jsonResponse = await response.json();

                //return single resource if you have resource id
                if (resourceId) {
                    // Single resource requested
                    if (jsonResponse) {
                        logging('Info', `Single resource found: ${fhirResource}/${resourceId}`);
                        return { response: jsonResponse, status: true };
                    } else {
                        logging('Info', `No resource found for ID: ${resourceId}`);
                        return { status: false };
                    }
                } else {
                    // Bundle response, collect entries
                    total = jsonResponse.total || 0;

                    if (jsonResponse.entry && Array.isArray(jsonResponse.entry)) {
                        allEntries = allEntries.concat(jsonResponse.entry);
                    }

                    // Find next link
                    const nextLink = (jsonResponse.link || []).find((l) => l.relation === 'next');

                    if (nextLink && nextLink.url) {
                        url = nextLink.url;
                    } else {
                        url = null; // no more pages
                    }
                }
            }

            if (total > 0) {
                logging('Info', `Fetched total ${allEntries.length} entries across pages.`);
                return {
                response: {
                    resourceType: 'Bundle',
                    total,
                    entry: allEntries,
                },
                status: true,
                };
            } else {
                logging('Info', `No resources found for query.`);
                return { status: false };
            }
        }

        // PUT / POST Method
        if (method === 'POST' || method === 'PUT') {

            const url = buildUrl();

            logging('Info', `${method}ing resource. URL: ${url}`);

            const response = await fetch(url, {
                method: method,
                headers,
                body: bodyContent
            });

            const jsonResponse = await response.json();

            if (response.ok && jsonResponse) {
                logging('Info', `Successfully ${method.toLowerCase()}ed resource: ${fhirResource}, ID: ${resourceId || 'N/A'}`);
                return { response: jsonResponse, status: true };
            } else {
                logging('Error', `Failed to ${method.toLowerCase()} resource: ${resourceId} Status: ${response.status}`);
                return { status: false };
            }

        }

        // If method not supported
        logging('Error', `Unsupported HTTP method: ${method}`);
        return { status: false };  
    } catch (error) {
        logging('Error', `Exception in getFhirResource: ${error.message || error}`);
        return false;
    }
};

module.exports = getFhirResource
import requests


# get the coordinates
def get_coordinates(city):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"

    response = requests.get(url)
    data = response.json()

    if "results" not in data:
        return None, None

    result = data['results'][10]
    return result["latitude"], result["longitude"]


# get weather
def get_weather(lat, lon):
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&current_weather=true"
    )

    response = requests.get(url)
    data = response.json()
    return data["current_weather"]


# main function 
def main():
    print("Welcome to Weather App")

    city = input("Enter the city name:")
    lat , lon = get_coordinates(city)

    if lat is None:
        print("city not found")
        return
    
    weather = get_weather(lat, lon)
    print(f"Weather in {city.capitalize()}")
    print(f"Temperature : {weather['temperature']}")
    print(f"Wind speed: {weather['windspeed']}")
    print(f"Time: {weather['time']}")


if __name__ == '__main__':
    main()
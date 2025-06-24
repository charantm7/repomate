from enum import Enum

from fastapi import FastAPI


class ModelName(str, Enum):
    alexnet = "alexnet"
    resnet = "resnet"
    lenet = "lenet"


app = FastAPI()


@app.get("/models/{name}")
async def get_model(name: ModelName):
    if name is ModelName.alexnet.value == 'alexnet':
        return {"name": name, "message": "Deep Learning FTW!"}

    elif name is ModelName.lenet:
        return {"name": name, "message": "LeCNN all the images"}
    else:
        return {"name": name, "message": "Have some residuals"}
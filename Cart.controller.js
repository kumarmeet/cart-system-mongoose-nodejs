const Cart = require("../../models/Cart");
const Meal = require("../../models/Meals");

const addItemToCart = async (req, res, next) => {
  try {
    const { _id } = req.user;
    const { productId } = req.body;
    const quantity = Number.parseInt(req.body.quantity);

    let cart = await Cart.findOne();

    let productDetails = await Meal.findById(productId);

    if (!productDetails) {
      return res.status(500).json({
        status: false,
        message: "Invalid request",
      });
    }

    //--If Cart Exists ----
    if (cart) {
      //---- check if index exists ----
      const indexFound = cart.items.findIndex(
        (item) => item.productId._id == productId
      );

      //------this removes an item from the the cart if the quantity is set to zero,We can use this method to remove an item from the list  -------
      if (indexFound !== -1 && quantity <= 0) {
        cart.items.splice(indexFound, 1);
        if (cart.items.length == 0) {
          cart.subTotal = 0;
        } else {
          cart.subTotal = cart.items
            .map((item) => item.total)
            .reduce((acc, next) => acc + next);
        }
      }

      //----------check if product exist,just add the previous quantity with the new quantity and update the total price-------
      else if (indexFound !== -1) {
        cart.items[indexFound].quantity =
          cart.items[indexFound].quantity + quantity;
        cart.items[indexFound].total =
          cart.items[indexFound].quantity * productDetails.priceWithOffer;
        cart.items[indexFound].price = productDetails.priceWithOffer;
        cart.subTotal = cart.items
          .map((item) => item.total)
          .reduce((acc, next) => (acc + next).toFixed(2));
      }

      //----Check if Quantity is Greater than 0 then add item to items Array ----
      else if (quantity > 0) {
        cart.items.push({
          productId: productId,
          quantity: quantity,
          price: productDetails.priceWithOffer,
          total: parseFloat(productDetails.priceWithOffer * quantity).toFixed(
            2
          ),
        });
        cart.subTotal = cart.items
          .map((item) => item.total)
          .reduce((acc, next) => (acc + next).toFixed(2));
      }

      //----if quantity of price is 0 throw the error -------
      else {
        return res.status(400).json({
          status: false,
          message: "Invalid request",
        });
      }
      let data = await cart.save();
      return res.status(200).json({
        status: true,
        message: "Process successful",
        data: data,
      });
    }
    //------------ if there is no user with a cart...it creates a new cart and then adds the item to the cart that has been created------------
    else {
      const cartData = {
        userId: _id,
        items: [
          {
            productId: productId,
            quantity: quantity,
            total: parseFloat(productDetails.priceWithOffer * quantity).toFixed(
              2
            ),
            price: productDetails.priceWithOffer,
          },
        ],
        subTotal: parseFloat(productDetails.priceWithOffer * quantity).toFixed(
          2
        ),
      };
      cart = await Cart.create(cartData);
      // let data = await cart.save();
      return res.status(200).json(cart);
    }
  } catch (error) {
    next(error);
  }
};

const getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findById(
      { _id: req.query.cartId },
      {
        createdAt: 0,
        updatedAt: 0,
        "items.createdAt": 0,
        "items.updatedAt": 0,
      }
    ).populate("items.productId", { createdAt: 0, updatedAt: 0 });

    if (!cart) {
      return res.status(400).json({
        status: false,
        message: "Cart not found",
      });
    }

    res.status(200).json({
      status: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

const emptyCart = async (req, res, next) => {
  try {
    let cart = await Cart.findById({ _id: req.body.cartId });

    cart.items = [];
    cart.subTotal = 0;
    const data = await cart.save();

    res.status(200).json({
      status: true,
      message: "Cart items has been emptied",
      data: data,
    });
  } catch (error) {
    next(error);
  }
};

const deleteCart = async (req, res, next) => {
  try {
    await Cart.findByIdAndDelete({ _id: req.body.cartId });

    res.status(200).json({
      status: true,
      message: "Cart has been removed completely",
    });
  } catch (error) {
    next(error);
  }
};

const removeCartItem = async (req, res, next) => {
  try {
    let cart = await Cart.findOne();

    const indexFound = cart.items.findIndex(
      (item) => item.productId._id == req.body.productId
    );

    const removedItem = cart.items.splice(indexFound, 1);

    const product = await Cart.findOneAndUpdate(
      { _id: req.body.cartId },
      {
        $pull: {
          items: { productId: req.body.productId },
        },
        $set: {
          subTotal: (cart.subTotal - removedItem[0].total).toFixed(2),
        },
      },
      { new: true, useFindAndModify: false }
    );

    res.status(200).json({
      status: true,
      message: "Cart item has been removed",
      product,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addItemToCart,
  getCart,
  emptyCart,
  deleteCart,
  removeCartItem,
};

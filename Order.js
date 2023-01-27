const Order = require("../../models/Order");
const OrderItem = require("../../models/OrderItem");
const Cart = require("../../models/Cart");
const User = require("../../models/User");

const helperMergeQuantityByProductId = async (value) => {
  //map quantity by products logic
  const quantity = await OrderItem.find({ orderId: value._id })
    .lean()
    .then((data) => {
      return data.map((prod) => {
        return prod.productInfo;
      });
    });

  value.meals.map((obj, i) => {
    let found = quantity
      .flat()
      .find((prodId) => obj._id.toString() === prodId.productId.toString());

    //replace items
    value.meals.splice(i, 1, {
      ...obj,
      quantity: found.productQuantity,
    });
  });
  //map quantity by products logic end
};

const cartSummary = async (req, res, next) => {
  try {
    const { cartId } = req.query;

    const hasCart = await Cart.findById({ _id: cartId });

    if (!hasCart) {
      return res.status(400).json({
        status: false,
        message: "Cart has no items!",
      });
    }

    const cartData = await Cart.findById(
      { _id: cartId },
      {
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
        "items.createdAt": 0,
        "items.updatedAt": 0,
      }
    )
      .populate("items.productId", {
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
      })
      .lean()
      .then((data) => {
        const cartSummaryItems = data.items.map((item) => {
          return {
            title: item.productId.title,
            image: item.productId.image,
            quantity: item.quantity,
            total: item.total,
          };
        });

        return {
          cartSummaryItems,
          subtotal: data.subTotal,
        };
      });

    return res.status(200).json({
      status: true,
      data: cartData,
    });
  } catch (error) {
    next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const { cartId, addressId, deliveryInstructions } = req.body;
    const { _id } = req.user;

    let cart = await Cart.findById(
      { _id: cartId },
      {
        createdAt: 0,
        updatedAt: 0,
        "items._id": 0,
        "items.createdAt": 0,
        "items.updatedAt": 0,
        __v: 0,
      }
    )
      .populate("items.productId", {
        createdAt: 0,
        updatedAt: 0,
        addresses: 0,
        password: 0,
        mobileNumber: 0,
        isVerified: 0,
        isDeleted: 0,
        menuId: 0,
        __v: 0,
      })
      .lean();

    if (!cart) {
      return res.status(400).json({
        status: false,
        message: "Cart not found",
      });
    }

    const address = await User.findById({ _id: _id })
      .lean()
      .then((user) => {
        return user.addresses.find((data) => data._id.toString() === addressId);
      });

    const completeData = { cart, address };

    const productIds = completeData.cart.items.map((data) => data.productId);

    const finalDiscount = completeData.cart.items.reduce((acc, data) => {
      if (+data.productId.flatDiscount > 0) {
        acc += +data.productId.flatDiscount;
      }

      if (data.productId.percentageDiscount > 0) {
        acc +=
          +data.productId.price * (+data.productId.percentageDiscount / 100);
      }

      return acc;
    }, 0);

    const dataForSaveToOrder = {
      userId: _id,
      meals: productIds,
      subTotal: completeData.cart.subTotal,
      address: completeData.address._id,
      deliveryCharge: 10, //need to change after
      discount: finalDiscount, // need to change after
      deliveryInstructions: deliveryInstructions,
    };

    const order = await Order.create(dataForSaveToOrder);

    const dataForSaveToOrderItem = await OrderItem.create({
      orderId: order._id,
    });

    completeData.cart.items.map((data) => {
      dataForSaveToOrderItem.productInfo.push({
        productId: data.productId._id,
        productPrice: data.productId.price,
        productQuantity: data.quantity,
      });
    });

    await dataForSaveToOrderItem.save();

    await Cart.findByIdAndDelete({ _id: cartId });

    return res.status(200).json({
      status: true,
      message: "Order has been processed",
      orderId: order._id,
    });
  } catch (error) {
    next(error);
  }
};

const updateOrder = async (req, res, next) => {
  /*
    req.body = {
  	"orderId": "63cfd6f9ae968acfd3b348d3",
  	"paymentMethod": "1",
  	"paymentReference": "uoiuweqoriuoiu",
  	"transactionId": "New order"
  }*/

  try {
    const { paymentMethod, orderId } = req.body;

    if (paymentMethod != 1 && paymentMethod != 2) {
      return res.status(400).json({
        status: false,
        message:
          "Payment method is incorrect please select 1 -> online or 2 -> cash",
      });
    }

    delete req.body.orderId;

    const updateOrderData = {
      ...req.body,
      paymentStatus: true,
      status: true,
    };

    await Order.findByIdAndUpdate({ _id: orderId }, updateOrderData);

    return res.status(200).json({
      status: true,
      message: "Order has been sucessfully completed",
      orderId: orderId,
    });
  } catch (error) {
    next(error);
  }
};

const orderHistory = async (req, res, next) => {
  try {
    const { _id } = req.user;

    const orderHistory = await Order.find(
      { userId: _id },
      {
        userId: 0,
        updatedAt: 0,
        paymentMethod: 0,
        paymentReference: 0,
        __v: 0,
      }
    )
      .lean()
      .populate("meals", {
        addresses: 0,
        updatedAt: 0,
        createdAt: 0,
        flatDiscount: 0,
        price: 0,
        __v: 0,
      })
      .then((data) => {
        return Promise.all(
          data.map(async (v) => {
            let address = await User.findById({ _id: _id })
              .lean()
              .then((userAddress) => {
                return userAddress.addresses
                  .map((obj) => {
                    return {
                      addressType: obj.addressType,
                      completeAddress: obj.completeAddress,
                      landMark: obj.landMark,
                      _id: obj._id,
                      status: obj.status,
                    };
                  })
                  .find((f) => f._id.toString() === v.address.toString());
              });

            await helperMergeQuantityByProductId(v);

            return {
              ...v,
              address,
            };
          })
        );
      });

    return res.status(200).json({
      status: true,
      orderHistory,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  cartSummary,
  createOrder,
  updateOrder,
  orderHistory,
};

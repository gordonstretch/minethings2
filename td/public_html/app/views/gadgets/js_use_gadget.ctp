<? 
echo $ajax->div('timeRemaining'.$gadgetId);
echo $gadget->GadgetsMinerInfo($gadgetsMiner, $gadgetData);
echo $ajax->divEnd('timeRemaining'.$gadgetId);

echo $ajax->div('itemCount'.$itemId);
echo $itemCount;
echo $ajax->divEnd('itemCount'.$itemId);
?>

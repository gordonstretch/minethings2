<?
echo $ajax->div('Owned'.$containerId);
echo $count;
echo $ajax->divEnd('Owned'.$containerId);

echo $ajax->div('ContainerError');
if (isset($containerError))
	echo '<span style="color:red">'.$containerError."</span>";
echo $ajax->divEnd('ContainerError');

echo $ajax->div('ItemLimit');
echo $itemLimit;
echo $ajax->divEnd('ItemLimit');
?>
